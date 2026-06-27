import { execa, execaSync } from 'execa';
import * as fs from 'fs';
import * as path from 'path';
import { derivePlayShortDescription } from './app-release-notes';
import { ROOT } from './app-release';
import { FRONTEND_DIR } from './app-release-build';
import type { IosAppStoreConnectState, ReleaseSession } from './app-release-session';

export const UPLOAD_DIR = path.join(ROOT, '.app-release/upload');
export const PLAY_METADATA_DIR = path.join(UPLOAD_DIR, 'android');
export const IOS_RELEASE_NOTES_PATH = path.join(UPLOAD_DIR, 'ios-release-notes.txt');

export const PLAY_TRACKS = ['internal', 'closed', 'production'] as const;
export type PlayTrack = (typeof PLAY_TRACKS)[number];

const LOG_TAIL_LINES = 40;
const IOS_STATE_PREFIX = 'APP_RELEASE_IOS_STATE_JSON:';

export interface UploadPreflight {
  ok: boolean;
  issues: string[];
}

export interface UploadMetadataPaths {
  playMetadataPath: string;
  iosReleaseNotesPath: string;
}

export class ReleaseUploadError extends Error {
  readonly logTail: string;
  readonly output: string;
  readonly iosState: IosAppStoreConnectState;

  constructor(
    message: string,
    logTail: string,
    options?: { output?: string; iosState?: IosAppStoreConnectState },
  ) {
    super(message);
    this.name = 'ReleaseUploadError';
    this.logTail = logTail;
    this.output = options?.output ?? '';
    this.iosState = options?.iosState ?? {};
  }
}

export function isAndroidAlreadyUploadedError(error: ReleaseUploadError): boolean {
  const text = `${error.message}\n${error.logTail}`;
  return /version code .*already (?:been )?(?:used|uploaded)|apk specifies a version code that has already been used|aab specifies a version code that has already been used|artifact .*already exists/i.test(
    text,
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

function resolvePlayJsonKeyPath(): string | undefined {
  const candidate = process.env.PLAY_STORE_JSON_KEY_PATH ?? process.env.GOOGLE_PLAY_JSON_KEY;
  if (!candidate?.trim()) {
    return undefined;
  }
  const absolute = path.resolve(candidate);
  return fs.existsSync(absolute) ? absolute : undefined;
}

function resolveFastlaneInvocation(): { command: string; prefix: string[] } {
  const gemfile = path.join(FRONTEND_DIR, 'Gemfile');
  if (fs.existsSync(gemfile)) {
    return { command: 'bundle', prefix: ['exec', 'fastlane'] };
  }
  return { command: 'fastlane', prefix: [] };
}

export function tailUploadLog(output: string, lineCount = LOG_TAIL_LINES): string {
  const lines = output.split('\n').filter((line) => line.trim().length > 0);
  const usefulErrorPattern =
    /(?:Google Api Error|App Store Connect|appStoreVersions|The provided entity|missing a required attribute|whatsNew|Version code .*already|already been used|already uploaded|Cannot submit for review|selected build|submit-for-review|ERROR \[|^\[.*\]: \[!]|\[!] )/i;
  const usefulErrors = lines.filter(
    (line) => usefulErrorPattern.test(line) && !/^\s*from .*fastlane.* in /.test(line),
  );
  if (usefulErrors.length > 0) {
    return usefulErrors.slice(-lineCount).join('\n');
  }
  if (lines.length <= lineCount) {
    return lines.join('\n');
  }
  return lines.slice(-lineCount).join('\n');
}

function mergeIosState(
  current: IosAppStoreConnectState,
  next: IosAppStoreConnectState,
): IosAppStoreConnectState {
  return {
    ...current,
    ...Object.fromEntries(
      Object.entries(next).filter(([, value]) => typeof value === 'string' && value.length > 0),
    ),
  };
}

export function parseIosAppStoreConnectState(output: string): IosAppStoreConnectState {
  let state: IosAppStoreConnectState = {};
  for (const line of output.split(/\r?\n/)) {
    const markerIndex = line.indexOf(IOS_STATE_PREFIX);
    if (markerIndex < 0) {
      continue;
    }

    const raw = line.slice(markerIndex + IOS_STATE_PREFIX.length).trim();
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      state = mergeIosState(state, {
        appStoreVersionId:
          typeof parsed.appStoreVersionId === 'string' ? parsed.appStoreVersionId : undefined,
        buildId: typeof parsed.buildId === 'string' ? parsed.buildId : undefined,
        lastObservedProcessingStatus:
          typeof parsed.lastObservedProcessingStatus === 'string'
            ? parsed.lastObservedProcessingStatus
            : undefined,
        metadataUpdatedAt:
          typeof parsed.metadataUpdatedAt === 'string' ? parsed.metadataUpdatedAt : undefined,
        submissionId: typeof parsed.submissionId === 'string' ? parsed.submissionId : undefined,
      });
    } catch {
      // Ignore non-JSON marker lines; the human-readable Fastlane output is still preserved.
    }
  }
  return state;
}

function addFastlaneIssue(issues: string[]): void {
  const fastlane = resolveFastlaneInvocation();
  if (fastlane.command === 'bundle' && !commandExists('bundle')) {
    issues.push(
      'Bundler is not installed — run: gem install bundler && cd Frontend && bundle install',
    );
  } else if (!commandExists(fastlane.command)) {
    issues.push(
      fastlane.command === 'bundle'
        ? 'Fastlane is not available via Bundler — run: cd Frontend && bundle install'
        : 'Fastlane is not installed — run: cd Frontend && bundle install, or brew install fastlane',
    );
  }
}

function formatExecError(error: unknown): ReleaseUploadError {
  if (error instanceof ReleaseUploadError) {
    return error;
  }

  if (error && typeof error === 'object' && ('stdout' in error || 'stderr' in error)) {
    const execError = error as { shortMessage?: string; stdout?: string; stderr?: string };
    const combined = [execError.stdout ?? '', execError.stderr ?? ''].join('\n').trim();
    const message = execError.shortMessage ?? 'Store upload command failed';
    return new ReleaseUploadError(message, tailUploadLog(combined), {
      output: combined,
      iosState: parseIosAppStoreConnectState(combined),
    });
  }

  const message = error instanceof Error ? error.message : String(error);
  return new ReleaseUploadError(message, '');
}

export function resolvePlayWhatsNewText(session: ReleaseSession): string {
  if (!session.notes) {
    throw new Error('Release notes are required for store upload');
  }
  const derived = derivePlayShortDescription(session.notes.main, session.notes.short);
  return derived ?? session.notes.main;
}

export function prepareUploadMetadata(session: ReleaseSession): UploadMetadataPaths {
  if (!session.notes) {
    throw new Error('Release notes are required for store upload');
  }

  const changelogDir = path.join(PLAY_METADATA_DIR, 'en-US/changelogs');
  fs.mkdirSync(changelogDir, { recursive: true });
  fs.mkdirSync(path.dirname(IOS_RELEASE_NOTES_PATH), { recursive: true });

  const playWhatsNew = resolvePlayWhatsNewText(session);
  const changelogPath = path.join(changelogDir, `${session.planned.build}.txt`);
  fs.writeFileSync(changelogPath, playWhatsNew, 'utf-8');
  fs.writeFileSync(IOS_RELEASE_NOTES_PATH, session.notes.main, 'utf-8');

  return {
    playMetadataPath: PLAY_METADATA_DIR,
    iosReleaseNotesPath: IOS_RELEASE_NOTES_PATH,
  };
}

export function runUploadPreflight(session: ReleaseSession): UploadPreflight {
  const issues: string[] = [];
  const androidPending = session.uploads?.android !== true;
  const iosPending = session.uploads?.ios !== true;
  const iosBinaryPending = iosPending && session.uploads?.iosBinary !== true;

  if (!androidPending && !iosPending) {
    return { ok: true, issues };
  }

  if (!session.notes) {
    issues.push('Release notes are missing from the session.');
  }

  if (androidPending && (!session.artifacts?.aab || !fs.existsSync(session.artifacts.aab))) {
    issues.push('Android AAB artifact is missing — run the build phase first.');
  }

  if (iosBinaryPending && (!session.artifacts?.ipa || !fs.existsSync(session.artifacts.ipa))) {
    issues.push('iOS IPA artifact is missing — run the build phase first.');
  }

  if (androidPending && !session.store.androidTrack) {
    issues.push('Google Play track is not set (internal, closed, or production).');
  }

  if (iosPending && session.store.iosSubmitForReview === undefined) {
    issues.push('iOS App Store mode is not set (prepare-without-submit or submit-for-review).');
  }

  const playKey = androidPending ? resolvePlayJsonKeyPath() : undefined;
  if (androidPending && !playKey) {
    issues.push(
      'Set PLAY_STORE_JSON_KEY_PATH or GOOGLE_PLAY_JSON_KEY to your Play Console service account JSON file.',
    );
  }

  const ascKeyId = iosPending ? process.env.ASC_KEY_ID?.trim() : undefined;
  const ascIssuerId = iosPending ? process.env.ASC_ISSUER_ID?.trim() : undefined;
  const ascKeyPath = iosPending ? process.env.ASC_KEY_PATH?.trim() : undefined;
  if (iosPending && (!ascKeyId || !ascIssuerId || !ascKeyPath)) {
    issues.push(
      'Set ASC_KEY_ID, ASC_ISSUER_ID, and ASC_KEY_PATH for App Store Connect API access.',
    );
  } else if (iosPending && !fs.existsSync(path.resolve(ascKeyPath!))) {
    issues.push(`App Store Connect API key not found at ${ascKeyPath}`);
  }

  addFastlaneIssue(issues);

  return { ok: issues.length === 0, issues };
}

export function runStoreVerificationPreflight(session: ReleaseSession): UploadPreflight {
  const issues: string[] = [];
  const androidPending = session.uploads?.androidStoreVerified !== true;
  const iosPending = session.uploads?.iosStoreVersionVerified !== true;

  if (!androidPending && !iosPending) {
    return { ok: true, issues };
  }

  if (!session.notes) {
    issues.push('Release notes are missing from the session.');
  }

  if (androidPending && session.uploads?.android !== true) {
    issues.push('Android upload is not complete yet.');
  }

  if (iosPending && session.uploads?.iosStoreVersion !== true && session.uploads?.ios !== true) {
    issues.push('App Store metadata has not been finalized yet.');
  }

  if (androidPending && !session.store.androidTrack) {
    issues.push('Google Play track is not set (internal, closed, or production).');
  }

  if (iosPending && session.store.iosSubmitForReview === undefined) {
    issues.push('iOS App Store mode is not set (prepare-without-submit or submit-for-review).');
  }

  const playKey = androidPending ? resolvePlayJsonKeyPath() : undefined;
  if (androidPending && !playKey) {
    issues.push(
      'Set PLAY_STORE_JSON_KEY_PATH or GOOGLE_PLAY_JSON_KEY to your Play Console service account JSON file.',
    );
  }

  const ascKeyId = iosPending ? process.env.ASC_KEY_ID?.trim() : undefined;
  const ascIssuerId = iosPending ? process.env.ASC_ISSUER_ID?.trim() : undefined;
  const ascKeyPath = iosPending ? process.env.ASC_KEY_PATH?.trim() : undefined;
  if (iosPending && (!ascKeyId || !ascIssuerId || !ascKeyPath)) {
    issues.push(
      'Set ASC_KEY_ID, ASC_ISSUER_ID, and ASC_KEY_PATH for App Store Connect API access.',
    );
  } else if (iosPending && !fs.existsSync(path.resolve(ascKeyPath!))) {
    issues.push(`App Store Connect API key not found at ${ascKeyPath}`);
  }

  addFastlaneIssue(issues);

  return { ok: issues.length === 0, issues };
}

async function runFastlaneLane(
  platform: 'android' | 'ios',
  lane: string,
  params: Record<string, string>,
): Promise<{ output: string; iosState: IosAppStoreConnectState }> {
  const { command, prefix } = resolveFastlaneInvocation();
  const args = [...prefix, platform, lane];
  for (const [key, value] of Object.entries(params)) {
    args.push(`${key}:${value}`);
  }

  try {
    const result = await execa(command, args, {
      cwd: FRONTEND_DIR,
      env: process.env,
      stdio: 'pipe',
    });
    const output = [result.stdout, result.stderr].join('\n').trim();
    return {
      output,
      iosState: parseIosAppStoreConnectState(output),
    };
  } catch (error) {
    throw formatExecError(error);
  }
}

function resolveUploadInputs(session: ReleaseSession): {
  metadata: UploadMetadataPaths;
  aab: string;
  ipa: string;
  track: string;
  submitForReview: boolean;
} {
  const preflight = runUploadPreflight(session);
  if (!preflight.ok) {
    throw new ReleaseUploadError('Upload preflight failed', preflight.issues.join('\n'));
  }

  const metadata = prepareUploadMetadata(session);
  return {
    metadata,
    aab: session.artifacts?.aab ? path.resolve(session.artifacts.aab) : '',
    ipa: session.artifacts?.ipa ? path.resolve(session.artifacts.ipa) : '',
    track: session.store.androidTrack!,
    submitForReview: session.store.iosSubmitForReview === true,
  };
}

export async function runAndroidUpload(session: ReleaseSession): Promise<void> {
  const { metadata, aab, track } = resolveUploadInputs(session);
  await runFastlaneLane('android', 'upload_release', {
    aab,
    track,
    metadata_path: metadata.playMetadataPath,
  });
}

export async function runAndroidStoreVerification(session: ReleaseSession): Promise<void> {
  const preflight = runStoreVerificationPreflight(session);
  if (!preflight.ok) {
    throw new ReleaseUploadError('Store verification preflight failed', preflight.issues.join('\n'));
  }

  const metadata = prepareUploadMetadata(session);
  const changelogPath = path.join(
    metadata.playMetadataPath,
    'en-US/changelogs',
    `${session.planned.build}.txt`,
  );

  await runFastlaneLane('android', 'verify_release', {
    track: session.store.androidTrack!,
    version_code: String(session.planned.build),
    changelog_path: changelogPath,
  });
}

export async function runIosBinaryUpload(session: ReleaseSession): Promise<void> {
  const { ipa } = resolveUploadInputs(session);
  await runFastlaneLane('ios', 'upload_binary', {
    ipa,
  });
}

export async function runIosProcessedBuildWait(
  session: ReleaseSession,
): Promise<IosAppStoreConnectState> {
  const result = await runFastlaneLane('ios', 'wait_for_processed_ios_build', {
    app_version: session.planned.version,
    build_number: String(session.planned.build),
  });
  return result.iosState;
}

export async function runIosStoreVersionFinalize(
  session: ReleaseSession,
): Promise<IosAppStoreConnectState> {
  const { metadata, submitForReview } = resolveUploadInputs(session);
  const result = await runFastlaneLane('ios', 'finalize_store_version', {
    release_notes_path: metadata.iosReleaseNotesPath,
    app_version: session.planned.version,
    build_number: String(session.planned.build),
    submit_for_review: String(submitForReview),
  });
  return result.iosState;
}

export async function runIosStoreVersionVerification(
  session: ReleaseSession,
): Promise<IosAppStoreConnectState> {
  const { metadata, submitForReview } = resolveUploadInputs(session);
  const result = await runFastlaneLane('ios', 'verify_store_version', {
    release_notes_path: metadata.iosReleaseNotesPath,
    app_version: session.planned.version,
    build_number: String(session.planned.build),
    expected_submit_for_review: String(submitForReview),
  });
  return result.iosState;
}

export async function runIosUpload(session: ReleaseSession): Promise<void> {
  await runIosBinaryUpload(session);
  await runIosProcessedBuildWait(session);
  await runIosStoreVersionFinalize(session);
  await runIosStoreVersionVerification(session);
}

export async function runReleaseUpload(session: ReleaseSession): Promise<void> {
  await runAndroidUpload(session);
  await runIosUpload(session);
}

export function isPlayTrack(value: string): value is PlayTrack {
  return (PLAY_TRACKS as readonly string[]).includes(value);
}
