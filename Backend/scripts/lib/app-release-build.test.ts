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
  buildIosArchiveArgs,
  resolveIpaOutputPath,
  runBuildPreflight,
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
assert(!PRODUCTION_VITE_ENV.VITE_API_BASE_URL.includes('localhost'), 'production env avoids localhost');

assert(path.isAbsolute(AAB_OUTPUT), 'AAB output path is absolute');
assert(AAB_OUTPUT.endsWith('app-release.aab'), 'AAB output filename');

assert(fs.existsSync(FRONTEND_DIR), 'Frontend directory exists');
assert(fs.existsSync(EXPORT_OPTIONS_PLIST), 'iOS export plist exists');

const archiveArgs = buildIosArchiveArgs(IOS_ARCHIVE_PATH);
assert(archiveArgs.includes('-destination'), 'iOS archive args include destination');
assert(
  archiveArgs.includes(IOS_ARCHIVE_DESTINATION),
  'iOS archive targets generic iOS device',
);
assert(archiveArgs.includes('-allowProvisioningUpdates'), 'iOS archive allows provisioning updates');

const xcodeEnv = xcodeBuildEnv({ PATH: '/opt/homebrew/bin:/usr/bin', HOME: '/tmp/test' });
assert(xcodeEnv.PATH === XCODE_PATH_PREFIX, 'xcode env excludes Homebrew rsync');
assert(xcodeEnv.HOME === '/tmp/test', 'xcode env keeps other variables');

const preflight = runBuildPreflight();
assert(Array.isArray(preflight.issues), 'preflight returns issues array');
assert(typeof preflight.ok === 'boolean', 'preflight returns ok boolean');

const tempExportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-release-ipa-'));
const ipaPath = path.join(tempExportDir, 'App.ipa');
fs.writeFileSync(ipaPath, 'test');
assert(resolveIpaOutputPath(tempExportDir) === path.resolve(ipaPath), 'resolveIpaOutputPath finds IPA');
assert(path.isAbsolute(resolveIpaOutputPath(tempExportDir)), 'resolveIpaOutputPath returns absolute path');
fs.rmSync(tempExportDir, { recursive: true, force: true });

console.log('app-release-build tests: OK');
