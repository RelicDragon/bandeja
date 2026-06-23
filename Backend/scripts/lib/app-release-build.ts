import { execa, execaSync } from 'execa';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Listr } from 'listr2';
import { ROOT } from './app-release';
import type { ReleaseSession } from './app-release-session';

export const FRONTEND_DIR = path.join(ROOT, 'Frontend');
export const ANDROID_DIR = path.join(FRONTEND_DIR, 'android');
export const IOS_APP_DIR = path.join(FRONTEND_DIR, 'ios/App');
export const IOS_WORKSPACE = path.join(IOS_APP_DIR, 'App.xcworkspace');
export const EXPORT_OPTIONS_PLIST = path.join(FRONTEND_DIR, 'ios/ExportOptions-app-store.plist');
export const AAB_OUTPUT = path.join(ANDROID_DIR, 'app/build/outputs/bundle/release/app-release.aab');
export const RELEASE_BUILD_DIR = path.join(ROOT, '.app-release');
export const IOS_ARCHIVE_PATH = path.join(RELEASE_BUILD_DIR, 'ios/App.xcarchive');
export const IOS_EXPORT_DIR = path.join(RELEASE_BUILD_DIR, 'ios/export');

export const PRODUCTION_VITE_ENV: Record<string, string> = {
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
const LOG_TAIL_LINES = 40;
export const IOS_ARCHIVE_DESTINATION = 'generic/platform=iOS';

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

function resolveJavaHome(): string | undefined {
  if (process.env.JAVA_HOME) {
    return process.env.JAVA_HOME;
  }
  if (fs.existsSync(DEFAULT_JAVA_HOME)) {
    return DEFAULT_JAVA_HOME;
  }
  return undefined;
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

  if (!resolveJavaHome()) {
    issues.push('JAVA_HOME is not set and Homebrew OpenJDK 21 was not found.');
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

  const errorPattern = /(?:\berror:|\bfatal error:|\*\* ARCHIVE FAILED \*\*|The following build commands failed:)/i;
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
    const execError = error as { shortMessage?: string; stdout?: string; stderr?: string };
    const combined = [execError.stdout ?? '', execError.stderr ?? ''].join('\n').trim();
    const message = execError.shortMessage ?? 'Release build command failed';
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
      ['-lc', `set -euo pipefail; SCRIPT_DIR="${FRONTEND_DIR}"; source "${scriptPath}"; ${functionName}`],
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

export async function runReleaseBuild(_session: ReleaseSession): Promise<BuildArtifacts> {
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

  const tasks = new Listr(
    [
      {
        title: 'Production frontend build',
        task: async () => {
          await runCommand('npm', ['run', 'build'], { cwd: FRONTEND_DIR, env: sharedEnv });
          await runBashFunction('scripts/verify-capacitor-bundle.sh', 'verify_capacitor_bundle');
        },
      },
      {
        title: 'Capacitor sync (Android + iOS)',
        task: async () => {
          await runBashFunction('scripts/ensure-cocoapods.sh', 'ensure_cocoapods');
          await runBashFunction('scripts/fix-ios-pbx-object-version.sh', 'fix_ios_pbx_object_version');
          await runCommand('npx', ['cap', 'sync'], { cwd: FRONTEND_DIR, env: sharedEnv });
          await runBashFunction('scripts/fix-ios-pbx-object-version.sh', 'fix_ios_pbx_object_version');
          await runCommand('pod', ['install'], { cwd: IOS_APP_DIR, env: sharedEnv });
        },
      },
      {
        title: 'Android bundleRelease (AAB)',
        task: async () => {
          await runCommand('./gradlew', ['bundleRelease'], { cwd: ANDROID_DIR, env: sharedEnv });
        },
      },
      {
        title: 'iOS archive + export (IPA)',
        task: async () => {
          if (fs.existsSync(IOS_ARCHIVE_PATH)) {
            fs.rmSync(IOS_ARCHIVE_PATH, { recursive: true, force: true });
          }
          if (fs.existsSync(IOS_EXPORT_DIR)) {
            fs.rmSync(IOS_EXPORT_DIR, { recursive: true, force: true });
          }
          fs.mkdirSync(IOS_EXPORT_DIR, { recursive: true });

          await runCommand('xcodebuild', buildIosArchiveArgs(IOS_ARCHIVE_PATH), {
            cwd: ROOT,
            env: sharedEnv,
          });

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
            { cwd: ROOT, env: sharedEnv },
          );
        },
      },
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
