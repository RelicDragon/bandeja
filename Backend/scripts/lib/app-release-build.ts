import { execa, execaSync } from 'execa';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Listr } from 'listr2';
import { ROOT } from './app-release';
import type { ReleaseSession } from './app-release-session';
import { ReleaseProgressTimer, timedListrTask } from './app-release-timer';

export const FRONTEND_DIR = path.join(ROOT, 'Frontend');
export const ANDROID_DIR = path.join(FRONTEND_DIR, 'android');
export const IOS_APP_DIR = path.join(FRONTEND_DIR, 'ios/App');
export const IOS_WORKSPACE = path.join(IOS_APP_DIR, 'App.xcworkspace');
export const EXPORT_OPTIONS_PLIST = path.join(FRONTEND_DIR, 'ios/ExportOptions-app-store.plist');
export const AAB_OUTPUT = path.join(
  ANDROID_DIR,
  'app/build/outputs/bundle/release/app-release.aab',
);
export const RELEASE_BUILD_DIR = path.join(ROOT, '.app-release');
export const IOS_ARCHIVE_PATH = path.join(RELEASE_BUILD_DIR, 'ios/App.xcarchive');
export const IOS_EXPORT_DIR = path.join(RELEASE_BUILD_DIR, 'ios/export');

export const PRODUCTION_VITE_ENV: Record<string, string> = {
  NODE_ENV: 'production',
  VITE_TELEGRAM_BOT_URL: 'https://t.me/bandeja_padel_bot',
  VITE_MEDIA_BASE_URL: 'https://bandeja.me',
  VITE_API_BASE_URL: 'https://bandeja.me/api',
  VITE_GOOGLE_IOS_CLIENT_ID:
    '29841261894-9eu73ns39ee4qvs7d82rsgtoasoc3gq5.apps.googleusercontent.com',
  VITE_GOOGLE_ANDROID_CLIENT_ID:
    '29841261894-ai785ut6sde9e5k4ol3mnhe1ajkf9r07.apps.googleusercontent.com',
  VITE_GOOGLE_WEB_CLIENT_ID:
    '29841261894-3kb5f69ntct66j52nmfvm2j2jpvpdvfb.apps.googleusercontent.com',
};

const DEFAULT_JAVA_HOME = '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home';
const REQUIRED_ANDROID_TOOLCHAIN_VERSION = 21;
const LOG_TAIL_LINES = 40;
export const IOS_ARCHIVE_DESTINATION = 'generic/platform=iOS';

/** Homebrew rsync 3.x breaks xcodebuild export when it wins over /usr/bin/openrsync. */
export const XCODE_PATH_PREFIX = [
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
  '/Applications/Xcode.app/Contents/Developer/usr/bin',
].join(':');

/** xcodebuild must not see Homebrew rsync — use system openrsync only. */
export function xcodeBuildEnv(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...baseEnv, PATH: XCODE_PATH_PREFIX };
}

export function buildIosArchiveArgs(archivePath: string): string[] {
  return [
    'archive',
    '-workspace',
    IOS_WORKSPACE,
    '-scheme',
    'App',
    '-configuration',
    'Release',
    '-destination',
    IOS_ARCHIVE_DESTINATION,
    '-archivePath',
    archivePath,
    'CODE_SIGN_STYLE=Automatic',
    '-allowProvisioningUpdates',
  ];
}

export function buildIosCleanArgs(): string[] {
  return ['clean', '-workspace', IOS_WORKSPACE, '-scheme', 'App', '-configuration', 'Release'];
}

export interface BuildArtifacts {
  aab: string;
  ipa: string;
}

export interface BuildPreflight {
  ok: boolean;
  issues: string[];
}

export class ReleaseBuildError extends Error {
  readonly logTail: string;

  constructor(message: string, logTail: string) {
    super(message);
    this.name = 'ReleaseBuildError';
    this.logTail = logTail;
  }
}

export function parseJavaMajorVersion(versionOutput: string): number | undefined {
  const quotedVersion = versionOutput.match(/version "([^"]+)"/)?.[1];
  if (!quotedVersion) {
    return undefined;
  }
  const legacyMatch = quotedVersion.match(/^1\.(\d+)/);
  if (legacyMatch) {
    return Number(legacyMatch[1]);
  }
  const majorMatch = quotedVersion.match(/^(\d+)/);
  return majorMatch ? Number(majorMatch[1]) : undefined;
}

function javaVersionForHome(javaHome: string): number | undefined {
  const javaExecutable = path.join(javaHome, 'bin', 'java');
  if (!fs.existsSync(javaExecutable)) {
    return undefined;
  }

  try {
    const result = execaSync(javaExecutable, ['-version']);
    return parseJavaMajorVersion([result.stdout, result.stderr].join('\n'));
  } catch {
    return undefined;
  }
}

function javaHomeFromMacVersion(version: number): string | undefined {
  if (os.platform() !== 'darwin') {
    return undefined;
  }

  try {
    return execaSync('/usr/libexec/java_home', ['-v', String(version)]).stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

function currentJavaVersion(): number | undefined {
  try {
    const result = execaSync('java', ['-version']);
    return parseJavaMajorVersion([result.stdout, result.stderr].join('\n'));
  } catch {
    return undefined;
  }
}

function uniqueDefined(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export function selectJavaHomeForVersion(
  candidates: string[],
  version: number,
  versionForHome: (javaHome: string) => number | undefined,
): string | undefined {
  return candidates.find((candidate) => versionForHome(candidate) === version);
}

function findJavaHomeForVersion(version: number): string | undefined {
  const candidates = uniqueDefined([
    process.env.JAVA_HOME_21,
    DEFAULT_JAVA_HOME,
    javaHomeFromMacVersion(version),
    process.env.JAVA_HOME,
  ]);

  return selectJavaHomeForVersion(candidates, version, javaVersionForHome);
}

function resolveJavaHome(): string | undefined {
  return findJavaHomeForVersion(REQUIRED_ANDROID_TOOLCHAIN_VERSION);
}

function androidSigningConfigured(): boolean {
  const keystoreProps = path.join(ANDROID_DIR, 'keystore.properties');
  if (fs.existsSync(keystoreProps)) {
    return true;
  }
  return Boolean(
    process.env.ANDROID_KEYSTORE_FILE &&
    process.env.ANDROID_KEYSTORE_PASSWORD &&
    process.env.ANDROID_KEY_ALIAS &&
    process.env.ANDROID_KEY_PASSWORD,
  );
}

function commandExists(command: string): boolean {
  try {
    execaSync('bash', ['-lc', `command -v ${command}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function resolveIpaOutputPath(exportDir = IOS_EXPORT_DIR): string {
  if (!fs.existsSync(exportDir)) {
    throw new Error(`Missing iOS export directory: ${exportDir}`);
  }
  const ipaFiles = fs
    .readdirSync(exportDir)
    .filter((name) => name.endsWith('.ipa'))
    .map((name) => path.join(exportDir, name));
  if (ipaFiles.length === 0) {
    throw new Error(`No IPA found in ${exportDir}`);
  }
  return path.resolve(ipaFiles[0]);
}

export function runBuildPreflight(): BuildPreflight {
  const issues: string[] = [];

  if (!fs.existsSync(path.join(FRONTEND_DIR, 'package.json'))) {
    issues.push(`Frontend directory not found at ${FRONTEND_DIR}`);
  }

  if (!fs.existsSync(path.join(ANDROID_DIR, 'gradlew'))) {
    issues.push('Android Gradle wrapper missing — run Capacitor sync first.');
  }

  const releaseJavaHome = resolveJavaHome();
  if (!releaseJavaHome) {
    const activeJava = currentJavaVersion();
    issues.push(
      `Java ${REQUIRED_ANDROID_TOOLCHAIN_VERSION} is required for Android release builds. ` +
        `Install OpenJDK ${REQUIRED_ANDROID_TOOLCHAIN_VERSION} (for example: brew install openjdk@21) ` +
        `or set JAVA_HOME_21/JAVA_HOME to a JDK ${REQUIRED_ANDROID_TOOLCHAIN_VERSION} installation.` +
        (activeJava ? ` Current java is ${activeJava}.` : ''),
    );
  }

  if (!process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT) {
    issues.push('Set ANDROID_HOME or ANDROID_SDK_ROOT for Android release builds.');
  }

  if (!androidSigningConfigured()) {
    issues.push(
      'Android release signing is not configured. Copy Frontend/android/keystore.properties.example ' +
        'to keystore.properties or set ANDROID_KEYSTORE_* env vars.',
    );
  }

  if (!fs.existsSync(IOS_WORKSPACE)) {
    issues.push(`iOS workspace not found at ${IOS_WORKSPACE}`);
  }

  if (!fs.existsSync(EXPORT_OPTIONS_PLIST)) {
    issues.push(`Missing iOS export plist at ${EXPORT_OPTIONS_PLIST}`);
  }

  if (os.platform() !== 'darwin') {
    issues.push('iOS archive/export requires macOS with Xcode installed.');
  } else if (!commandExists('xcodebuild')) {
    issues.push('xcodebuild is not available — install Xcode command line tools.');
  }

  if (!commandExists('pod')) {
    issues.push('CocoaPods is not available — run: brew upgrade cocoapods');
  }

  return { ok: issues.length === 0, issues };
}

function isSimulatorDestinationLine(line: string): boolean {
  return /\{ platform:(iOS|watchOS|tvOS|visionOS) Simulator/.test(line);
}

function tailLog(output: string, lineCount = LOG_TAIL_LINES): string {
  const lines = output.split('\n').filter((line) => line.trim().length > 0);
  const withoutSimulatorNoise = lines.filter((line) => !isSimulatorDestinationLine(line));

  const errorPattern =
    /(?:\berror:|\bfatal error:|\*\* (?:ARCHIVE|EXPORT) FAILED \*\*|The following build commands failed:|rsync error:|rsync\(.*\): error:)/i;
  const errorIndexes = withoutSimulatorNoise
    .map((line, index) => (errorPattern.test(line) ? index : -1))
    .filter((index) => index >= 0);

  if (errorIndexes.length > 0) {
    const firstError = errorIndexes[0];
    const start = Math.max(0, firstError - 5);
    const end = Math.min(withoutSimulatorNoise.length, firstError + lineCount);
    return withoutSimulatorNoise.slice(start, end).join('\n');
  }

  const source = withoutSimulatorNoise.length > 0 ? withoutSimulatorNoise : lines;
  if (source.length <= lineCount) {
    return source.join('\n');
  }
  return source.slice(-lineCount).join('\n');
}

function formatExecError(error: unknown): ReleaseBuildError {
  if (error instanceof ReleaseBuildError) {
    return error;
  }

  if (error && typeof error === 'object' && 'stdout' in error && 'stderr' in error) {
    const execError = error as {
      shortMessage?: string;
      stdout?: string;
      stderr?: string;
    };
    const combined = [execError.stdout ?? '', execError.stderr ?? ''].join('\n').trim();
    let message = execError.shortMessage ?? 'Release build command failed';
    if (/rsync error:|--extended-attributes: unknown option/i.test(combined)) {
      message +=
        ' (Homebrew rsync conflicts with Xcode export — the release CLI uses system PATH for xcodebuild; retry after updating the script)';
    }
    return new ReleaseBuildError(message, tailLog(combined));
  }

  const message = error instanceof Error ? error.message : String(error);
  return new ReleaseBuildError(message, '');
}

async function runBashFunction(scriptRelativePath: string, functionName: string): Promise<void> {
  const scriptPath = path.join(FRONTEND_DIR, scriptRelativePath);
  try {
    await execa(
      'bash',
      [
        '-lc',
        `set -euo pipefail; SCRIPT_DIR="${FRONTEND_DIR}"; source "${scriptPath}"; ${functionName}`,
      ],
      { cwd: FRONTEND_DIR, stdio: 'pipe' },
    );
  } catch (error) {
    throw formatExecError(error);
  }
}

async function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv },
): Promise<void> {
  try {
    await execa(command, args, {
      cwd: options.cwd ?? ROOT,
      env: { ...process.env, ...options.env },
      stdio: 'pipe',
    });
  } catch (error) {
    throw formatExecError(error);
  }
}

async function runIosArchiveWithCleanRetry(env: NodeJS.ProcessEnv): Promise<void> {
  try {
    await runCommand('xcodebuild', buildIosArchiveArgs(IOS_ARCHIVE_PATH), {
      cwd: ROOT,
      env,
    });
    return;
  } catch (firstError) {
    const firstBuildError = formatExecError(firstError);

    if (fs.existsSync(IOS_ARCHIVE_PATH)) {
      fs.rmSync(IOS_ARCHIVE_PATH, { recursive: true, force: true });
    }

    try {
      await runCommand('xcodebuild', buildIosCleanArgs(), {
        cwd: ROOT,
        env,
      });
    } catch {
      throw firstBuildError;
    }

    try {
      await runCommand('xcodebuild', buildIosArchiveArgs(IOS_ARCHIVE_PATH), {
        cwd: ROOT,
        env,
      });
    } catch (retryError) {
      const retryBuildError = formatExecError(retryError);
      throw new ReleaseBuildError(
        `${retryBuildError.message} (after cleaning the iOS build state and retrying archive)`,
        retryBuildError.logTail || firstBuildError.logTail,
      );
    }
  }
}

function ensureReleaseBuildDirs(): void {
  fs.mkdirSync(path.dirname(IOS_ARCHIVE_PATH), { recursive: true });
  fs.mkdirSync(IOS_EXPORT_DIR, { recursive: true });
}

function assertArtifactExists(filePath: string, label: string): string {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new ReleaseBuildError(`${label} was not produced at ${absolutePath}`, '');
  }
  return absolutePath;
}

export async function runReleaseBuild(
  _session: ReleaseSession,
  timer: ReleaseProgressTimer = new ReleaseProgressTimer(),
): Promise<BuildArtifacts> {
  const preflight = runBuildPreflight();
  if (!preflight.ok) {
    throw new ReleaseBuildError('Build preflight failed', preflight.issues.join('\n'));
  }

  ensureReleaseBuildDirs();

  const javaHome = resolveJavaHome();
  const sharedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...PRODUCTION_VITE_ENV,
    ...(javaHome ? { JAVA_HOME: javaHome } : {}),
  };
  const iosEnv = xcodeBuildEnv(sharedEnv);

  const tasks = new Listr(
    [
      timedListrTask(timer, 'Production frontend build', async () => {
        await runCommand('npm', ['run', 'build'], {
          cwd: FRONTEND_DIR,
          env: sharedEnv,
        });
        await runBashFunction('scripts/verify-capacitor-bundle.sh', 'verify_capacitor_bundle');
      }),
      timedListrTask(timer, 'Capacitor sync (Android + iOS)', async () => {
        await runBashFunction('scripts/ensure-cocoapods.sh', 'ensure_cocoapods');
        await runBashFunction(
          'scripts/fix-ios-pbx-object-version.sh',
          'fix_ios_pbx_object_version',
        );
        await runCommand('npx', ['cap', 'sync'], {
          cwd: FRONTEND_DIR,
          env: sharedEnv,
        });
        await runBashFunction(
          'scripts/fix-ios-pbx-object-version.sh',
          'fix_ios_pbx_object_version',
        );
        await runCommand('pod', ['install'], {
          cwd: IOS_APP_DIR,
          env: sharedEnv,
        });
      }),
      timedListrTask(timer, 'Android bundleRelease (AAB)', async () => {
        await runCommand('./gradlew', ['bundleRelease'], {
          cwd: ANDROID_DIR,
          env: sharedEnv,
        });
      }),
      timedListrTask(timer, 'iOS archive + export (IPA)', async () => {
        if (fs.existsSync(IOS_ARCHIVE_PATH)) {
          fs.rmSync(IOS_ARCHIVE_PATH, { recursive: true, force: true });
        }
        if (fs.existsSync(IOS_EXPORT_DIR)) {
          fs.rmSync(IOS_EXPORT_DIR, { recursive: true, force: true });
        }
        fs.mkdirSync(IOS_EXPORT_DIR, { recursive: true });

        await runIosArchiveWithCleanRetry(iosEnv);

        await runCommand(
          'xcodebuild',
          [
            '-exportArchive',
            '-archivePath',
            IOS_ARCHIVE_PATH,
            '-exportPath',
            IOS_EXPORT_DIR,
            '-exportOptionsPlist',
            EXPORT_OPTIONS_PLIST,
          ],
          { cwd: ROOT, env: iosEnv },
        );
      }),
    ],
    { concurrent: false, exitOnError: true },
  );

  try {
    await tasks.run();
  } catch (error) {
    throw formatExecError(error);
  }

  return {
    aab: assertArtifactExists(AAB_OUTPUT, 'Android AAB'),
    ipa: assertArtifactExists(resolveIpaOutputPath(), 'iOS IPA'),
  };
}
