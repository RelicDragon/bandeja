import { execa, execaSync } from 'execa';
import * as fs from 'fs';
import * as path from 'path';
import { derivePlayShortDescription } from './app-release-notes';
import { ROOT } from './app-release';
import { FRONTEND_DIR } from './app-release-build';
import type { ReleaseSession } from './app-release-session';

export const UPLOAD_DIR = path.join(ROOT, '.app-release/upload');
export const PLAY_METADATA_DIR = path.join(UPLOAD_DIR, 'android');
export const IOS_RELEASE_NOTES_PATH = path.join(UPLOAD_DIR, 'ios-release-notes.txt');

export const PLAY_TRACKS = ['internal', 'closed', 'production'] as const;
export type PlayTrack = (typeof PLAY_TRACKS)[number];

const LOG_TAIL_LINES = 40;

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

  constructor(message: string, logTail: string) {
    super(message);
    this.name = 'ReleaseUploadError';
    this.logTail = logTail;
  }
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

function tailLog(output: string, lineCount = LOG_TAIL_LINES): string {
  const lines = output.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length <= lineCount) {
    return lines.join('\n');
  }
  return lines.slice(-lineCount).join('\n');
}

function formatExecError(error: unknown): ReleaseUploadError {
  if (error instanceof ReleaseUploadError) {
    return error;
  }

  if (error && typeof error === 'object' && ('stdout' in error || 'stderr' in error)) {
    const execError = error as { shortMessage?: string; stdout?: string; stderr?: string };
    const combined = [execError.stdout ?? '', execError.stderr ?? ''].join('\n').trim();
    const message = execError.shortMessage ?? 'Store upload command failed';
    return new ReleaseUploadError(message, tailLog(combined));
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

  if (!session.notes) {
    issues.push('Release notes are missing from the session.');
  }

  if (!session.artifacts?.aab || !fs.existsSync(session.artifacts.aab)) {
    issues.push('Android AAB artifact is missing — run the build phase first.');
  }

  if (!session.artifacts?.ipa || !fs.existsSync(session.artifacts.ipa)) {
    issues.push('iOS IPA artifact is missing — run the build phase first.');
  }

  if (!session.store.androidTrack) {
    issues.push('Google Play track is not set (internal, closed, or production).');
  }

  if (session.store.iosSubmitForReview === undefined) {
    issues.push('iOS upload mode is not set (upload-only or submit-for-review).');
  }

  const playKey = resolvePlayJsonKeyPath();
  if (!playKey) {
    issues.push(
      'Set PLAY_STORE_JSON_KEY_PATH or GOOGLE_PLAY_JSON_KEY to your Play Console service account JSON file.',
    );
  }

  const ascKeyId = process.env.ASC_KEY_ID?.trim();
  const ascIssuerId = process.env.ASC_ISSUER_ID?.trim();
  const ascKeyPath = process.env.ASC_KEY_PATH?.trim();
  if (!ascKeyId || !ascIssuerId || !ascKeyPath) {
    issues.push('Set ASC_KEY_ID, ASC_ISSUER_ID, and ASC_KEY_PATH for App Store Connect API access.');
  } else if (!fs.existsSync(path.resolve(ascKeyPath))) {
    issues.push(`App Store Connect API key not found at ${ascKeyPath}`);
  }

  const fastlane = resolveFastlaneInvocation();
  if (fastlane.command === 'bundle' && !commandExists('bundle')) {
    issues.push('Bundler is not installed — run: gem install bundler && cd Frontend && bundle install');
  } else if (!commandExists(fastlane.command)) {
    issues.push(
      fastlane.command === 'bundle'
        ? 'Fastlane is not available via Bundler — run: cd Frontend && bundle install'
        : 'Fastlane is not installed — run: cd Frontend && bundle install, or brew install fastlane',
    );
  }

  return { ok: issues.length === 0, issues };
}

async function runFastlaneLane(
  platform: 'android' | 'ios',
  params: Record<string, string>,
): Promise<void> {
  const { command, prefix } = resolveFastlaneInvocation();
  const args = [...prefix, platform, 'upload_release'];
  for (const [key, value] of Object.entries(params)) {
    args.push(`${key}:${value}`);
  }

  try {
    await execa(command, args, {
      cwd: FRONTEND_DIR,
      env: process.env,
      stdio: 'pipe',
    });
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
    aab: path.resolve(session.artifacts!.aab!),
    ipa: path.resolve(session.artifacts!.ipa!),
    track: session.store.androidTrack!,
    submitForReview: session.store.iosSubmitForReview === true,
  };
}

export async function runAndroidUpload(session: ReleaseSession): Promise<void> {
  const { metadata, aab, track } = resolveUploadInputs(session);
  await runFastlaneLane('android', {
    aab,
    track,
    metadata_path: metadata.playMetadataPath,
  });
}

export async function runIosUpload(session: ReleaseSession): Promise<void> {
  const { metadata, ipa, submitForReview } = resolveUploadInputs(session);
  await runFastlaneLane('ios', {
    ipa,
    release_notes_path: metadata.iosReleaseNotesPath,
    submit_for_review: String(submitForReview),
  });
}

export async function runReleaseUpload(session: ReleaseSession): Promise<void> {
  await runAndroidUpload(session);
  await runIosUpload(session);
}

export function isPlayTrack(value: string): value is PlayTrack {
  return (PLAY_TRACKS as readonly string[]).includes(value);
}
