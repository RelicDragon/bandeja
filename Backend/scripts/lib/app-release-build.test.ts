import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  AAB_OUTPUT,
  EXPORT_OPTIONS_PLIST,
  FRONTEND_DIR,
  IOS_ARCHIVE_DESTINATION,
  IOS_ARCHIVE_PATH,
  PRODUCTION_VITE_ENV,
  XCODE_PATH_PREFIX,
  androidResourceTableHasFirebaseConfig,
  buildIosArchiveArgs,
  buildIosCleanArgs,
  parseJavaMajorVersion,
  resolveIpaOutputPath,
  runAndroidBundleWithRetry,
  runBuildPreflight,
  selectBuildLogTail,
  selectJavaHomeForVersion,
  validateGoogleServicesConfig,
  xcodeBuildEnv,
} from './app-release-build';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

assert(PRODUCTION_VITE_ENV.VITE_API_BASE_URL === 'https://bandeja.me/api', 'production API URL');
assert(PRODUCTION_VITE_ENV.VITE_MEDIA_BASE_URL === 'https://bandeja.me', 'production media URL');
assert(PRODUCTION_VITE_ENV.NODE_ENV === 'production', 'release build forces production NODE_ENV');
assert(
  !PRODUCTION_VITE_ENV.VITE_API_BASE_URL.includes('localhost'),
  'production env avoids localhost',
);

assert(parseJavaMajorVersion('openjdk version "21.0.11" 2026-04-21') === 21, 'parses Java 21');
assert(parseJavaMajorVersion('java version "1.8.0_302"') === 8, 'parses legacy Java 8');
assert(
  selectJavaHomeForVersion(['/Library/Java/jdk-17', '/opt/homebrew/openjdk-21'], 21, (javaHome) =>
    javaHome.includes('21') ? 21 : 17,
  ) === '/opt/homebrew/openjdk-21',
  'selects Java 21 over stale Java 17 JAVA_HOME',
);

assert(path.isAbsolute(AAB_OUTPUT), 'AAB output path is absolute');
assert(AAB_OUTPUT.endsWith('app-release.aab'), 'AAB output filename');

assert(fs.existsSync(FRONTEND_DIR), 'Frontend directory exists');
assert(fs.existsSync(EXPORT_OPTIONS_PLIST), 'iOS export plist exists');

const googleServicesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-release-google-services-'));
const validGoogleServices = path.join(googleServicesDir, 'google-services.json');
fs.writeFileSync(
  validGoogleServices,
  JSON.stringify({
    project_info: { project_id: 'bandeja-padel' },
    client: [
      {
        client_info: {
          mobilesdk_app_id: '1:123:android:abc',
          android_client_info: { package_name: 'com.funified.bandeja' },
        },
      },
    ],
  }),
);
assert(
  validateGoogleServicesConfig(validGoogleServices, 'com.funified.bandeja').length === 0,
  'accepts matching Android Firebase configuration',
);
assert(
  validateGoogleServicesConfig(validGoogleServices, 'com.example.wrong').some((issue) =>
    issue.includes('com.example.wrong'),
  ),
  'rejects Firebase configuration for another Android package',
);
assert(
  validateGoogleServicesConfig(path.join(googleServicesDir, 'missing.json')).some((issue) =>
    issue.includes('Missing Android Firebase configuration'),
  ),
  'rejects a missing Android Firebase configuration',
);
assert(
  androidResourceTableHasFirebaseConfig('google_app_id\u0000gcm_defaultSenderId'),
  'accepts an AAB resource table containing Firebase app and sender resources',
);
assert(
  !androidResourceTableHasFirebaseConfig('ordinary_android_resources'),
  'rejects an AAB resource table without Firebase configuration',
);
fs.rmSync(googleServicesDir, { recursive: true, force: true });

const androidStyles = fs.readFileSync(
  path.join(FRONTEND_DIR, 'android/app/src/main/res/values/styles.xml'),
  'utf8',
);
const launchThemeMatch = androidStyles.match(
  /<style\s+name="AppTheme\.NoActionBarLaunch"[^>]*>[\s\S]*?<\/style>/,
);
assert(Boolean(launchThemeMatch), 'Android launch theme exists');
assert(
  launchThemeMatch?.[0].includes(
    '<item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>',
  ) === true,
  'Android launch theme hands off to AppCompat app theme after splash',
);

const archiveArgs = buildIosArchiveArgs(IOS_ARCHIVE_PATH);
assert(archiveArgs.includes('-destination'), 'iOS archive args include destination');
assert(archiveArgs.includes(IOS_ARCHIVE_DESTINATION), 'iOS archive targets generic iOS device');
assert(
  archiveArgs.includes('-allowProvisioningUpdates'),
  'iOS archive allows provisioning updates',
);
const cleanArgs = buildIosCleanArgs();
assert(cleanArgs[0] === 'clean', 'iOS clean args invoke clean');
assert(cleanArgs.includes('-workspace'), 'iOS clean args include workspace');

const xcodeEnv = xcodeBuildEnv({
  PATH: '/opt/homebrew/bin:/usr/bin',
  HOME: '/tmp/test',
});
assert(xcodeEnv.PATH === XCODE_PATH_PREFIX, 'xcode env excludes Homebrew rsync');
assert(xcodeEnv.HOME === '/tmp/test', 'xcode env keeps other variables');

const preflight = runBuildPreflight();
assert(Array.isArray(preflight.issues), 'preflight returns issues array');
assert(typeof preflight.ok === 'boolean', 'preflight returns ok boolean');

const gradleFailureTail = selectBuildLogTail(
  [
    '* What went wrong:',
    "Execution failed for task ':app:signReleaseBundle'.",
    '> A failure occurred while executing FinalizeBundleTask$BundleToolRunnable',
    ...Array.from({ length: 50 }, (_, index) => `at gradle.frame.${index}`),
    'Caused by: java.io.IOException: transient signing output failure',
    'at bundletool.signing.Finalizer.run(Finalizer.java:1)',
  ].join('\n'),
);
assert(
  gradleFailureTail.includes('transient signing output failure'),
  'build diagnostics retain a nested Gradle cause beyond the generic task failure',
);

const tempExportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-release-ipa-'));
const ipaPath = path.join(tempExportDir, 'App.ipa');
fs.writeFileSync(ipaPath, 'test');
assert(
  resolveIpaOutputPath(tempExportDir) === path.resolve(ipaPath),
  'resolveIpaOutputPath finds IPA',
);
assert(
  path.isAbsolute(resolveIpaOutputPath(tempExportDir)),
  'resolveIpaOutputPath returns absolute path',
);
fs.rmSync(tempExportDir, { recursive: true, force: true });

void (async () => {
  const attempts: string[][] = [];
  await runAndroidBundleWithRetry(async (args) => {
    attempts.push([...args]);
    if (attempts.length === 1) {
      throw new Error('transient bundle finalization failure');
    }
  });
  assert(attempts.length === 2, 'Android bundle retries once after a transient failure');
  assert(
    attempts[0].join(' ') === 'bundleRelease',
    'first Android bundle attempt uses the normal Gradle invocation',
  );
  assert(
    attempts[1].join(' ') === 'bundleRelease --stacktrace --no-daemon',
    'Android retry isolates Gradle state and captures the nested cause',
  );

  let failedAttempts = 0;
  try {
    await runAndroidBundleWithRetry(async () => {
      failedAttempts += 1;
      throw new Error(`persistent failure ${failedAttempts}`);
    });
    assert(false, 'persistent Android bundle failure must be reported');
  } catch (error) {
    assert(failedAttempts === 2, 'persistent Android bundle failure retries only once');
    assert(
      error instanceof Error && error.message.includes('isolated Gradle process'),
      'persistent Android bundle failure explains that the isolated retry also failed',
    );
  }

  console.log('app-release-build tests: OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
