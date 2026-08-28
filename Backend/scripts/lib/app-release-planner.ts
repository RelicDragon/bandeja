import { execSync } from 'child_process';
import * as fs from 'fs';
import { getAiService } from '../../src/services/ai/ai.service';
import {
  ANDROID_GRADLE,
  IOS_PBX,
  ROOT,
  commitCountSince,
  getHeadCommit,
  readBaseline,
  readNativeVersions,
  writeNativeVersions,
  type NativeVersion,
} from './app-release';
import {
  hydrateVersionsFromStores,
  mergeStoreVersionFloor,
  readLocalNativeVersions,
  storeVersionsForPlatform,
  validatePlannedAgainstStores,
  type StoreVersionSnapshot,
} from './app-release-store-version';
import { fetchLatestStoreVersions } from './app-release-upload';
import {
  includesAndroid,
  includesIos,
  releaseArtifactsPresentOnDisk,
  type ReleasePlatform,
  type ReleaseSession,
} from './app-release-session';

export interface PreflightInfo {
  baselineSha: string;
  headSha: string;
  commitCount: number;
  current: NativeVersion;
  planned: NativeVersion;
  storeVersions: StoreVersionSnapshot;
  localNative?: { android: NativeVersion; ios: NativeVersion };
  aiConfigured: boolean;
}

export function isDryRun(): boolean {
  return process.env.APP_RELEASE_DRY_RUN === '1';
}

export function shouldResumeSession(): boolean {
  return process.env.APP_RELEASE_RESUME === '1';
}

export function shouldStartFreshSession(): boolean {
  return process.env.APP_RELEASE_FRESH === '1';
}

export function shouldCleanBuildArtifacts(): boolean {
  return process.env.APP_RELEASE_CLEAN === '1';
}

function placeholderVersion(): NativeVersion {
  return { version: '0.0.0', build: 0 };
}

export function createReleaseSession(headRef = 'HEAD'): ReleaseSession {
  const baselineSha = readBaseline();
  const headSha = getHeadCommit(headRef).sha;
  let localNative: { android: NativeVersion; ios: NativeVersion } | undefined;
  try {
    localNative = readLocalNativeVersions();
  } catch {
    localNative = undefined;
  }

  return {
    baselineSha,
    headSha,
    targetPlatform: 'both',
    current: placeholderVersion(),
    planned: placeholderVersion(),
    storeVersions: {},
    localNative,
    notes: null,
    artifacts: {},
    store: {},
    uploads: {},
    iosAppStoreConnect: {},
    reviewGuard: {},
    autoCommit: undefined,
  };
}

export async function hydrateReleaseSessionFromStores(
  session: ReleaseSession,
  platform: ReleasePlatform = session.targetPlatform,
): Promise<ReleaseSession> {
  const storeVersions = await fetchLatestStoreVersions(platform);
  const { current, planned } = hydrateVersionsFromStores(storeVersions, platform);
  let localNative = session.localNative;
  try {
    localNative = readLocalNativeVersions();
  } catch {
    // Keep previous local snapshot when native files are temporarily unreadable.
  }

  return {
    ...session,
    targetPlatform: platform,
    storeVersions,
    localNative,
    current,
    planned,
  };
}

/**
 * Re-read live store versions and keep the existing planned release only if it still
 * clears the store floor. Used right before bump/upload so a resumed session cannot
 * reuse a version that landed on the stores while the planner was idle.
 */
export async function refreshStoreVersionsKeepingPlanned(
  session: ReleaseSession,
): Promise<ReleaseSession> {
  const storeVersions = await fetchLatestStoreVersions(session.targetPlatform);
  const versions = storeVersionsForPlatform(storeVersions, session.targetPlatform);
  if (versions.length === 0) {
    throw new Error('No store versions available for the selected release target.');
  }
  const current = mergeStoreVersionFloor(versions);
  const validationError = validatePlannedAgainstStores(
    session.planned,
    storeVersions,
    session.targetPlatform,
  );
  if (validationError) {
    throw new Error(
      `${validationError} Re-run with a fresh session (or raise version/build) before uploading.`,
    );
  }

  let localNative = session.localNative;
  try {
    localNative = readLocalNativeVersions();
  } catch {
    // Keep previous local snapshot when native files are temporarily unreadable.
  }

  return {
    ...session,
    storeVersions,
    localNative,
    current,
  };
}

export function runPreflight(session: ReleaseSession): PreflightInfo {
  return {
    baselineSha: session.baselineSha,
    headSha: session.headSha,
    commitCount: commitCountSince(session.baselineSha, session.headSha),
    current: session.current,
    planned: session.planned,
    storeVersions: session.storeVersions ?? {},
    localNative: session.localNative,
    aiConfigured: getAiService().isConfigured(),
  };
}

export function parseVersionInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Version is empty');
  }
  const parts = trimmed.split('.');
  if (parts.length === 0 || parts.some((part) => part === '' || !/^\d+$/.test(part))) {
    throw new Error('Use dot-separated numeric segments, e.g. 0.96.41');
  }
  return trimmed;
}

export function parseBuildInput(value: string): number {
  const build = Number.parseInt(String(value).trim(), 10);
  if (!Number.isInteger(build) || build < 0 || String(build) !== String(value).trim()) {
    throw new Error('Enter a non-negative integer build number');
  }
  return build;
}

export function applyPlannedVersions(
  session: ReleaseSession,
  options?: { dryRun?: boolean },
): void {
  const dryRun = options?.dryRun ?? isDryRun();
  if (dryRun) {
    return;
  }
  const validationError = validatePlannedAgainstStores(
    session.planned,
    session.storeVersions ?? {},
    session.targetPlatform,
  );
  if (validationError) {
    throw new Error(validationError);
  }
  writeNativeVersions(session.planned);
}

export function snapshotNativeProjectFiles(): { android: string; ios: string } {
  return {
    android: fs.readFileSync(ANDROID_GRADLE, 'utf-8'),
    ios: fs.readFileSync(IOS_PBX, 'utf-8'),
  };
}

export function nativeProjectFilesMatch(
  before: { android: string; ios: string },
  after: { android: string; ios: string },
): boolean {
  return before.android === after.android && before.ios === after.ios;
}

export type ReleaseSessionPhase =
  'planning' | 'ready-to-apply' | 'ready-to-build' | 'ready-to-upload';

export function getSessionPhase(session: ReleaseSession): ReleaseSessionPhase {
  if (!session.notes) {
    return 'planning';
  }

  try {
    const native = readNativeVersions();
    const versionsApplied =
      native.version === session.planned.version && native.build === session.planned.build;
    if (!versionsApplied) {
      return 'ready-to-apply';
    }
  } catch {
    return 'ready-to-apply';
  }

  const needsAndroid = includesAndroid(session.targetPlatform);
  const needsIos = includesIos(session.targetPlatform);
  const onDisk = releaseArtifactsPresentOnDisk(session);
  const hasArtifacts = Boolean(
    (!needsAndroid || onDisk.aab) && (!needsIos || onDisk.ipa),
  );
  if (!hasArtifacts) {
    return 'ready-to-build';
  }

  return 'ready-to-upload';
}

export function storeConfigComplete(
  store: ReleaseSession['store'],
  platform: ReleasePlatform = 'both',
): boolean {
  return (
    (!includesAndroid(platform) || Boolean(store.androidTrack)) &&
    (!includesIos(platform) || store.iosSubmitForReview !== undefined)
  );
}

export function formatCommitPreview(baselineSha: string, headSha: string, limit = 8): string {
  const out = execSync(`git log ${baselineSha}..${headSha} --reverse --format='%h %s'`, {
    cwd: ROOT,
    maxBuffer: 1024 * 1024,
  })
    .toString()
    .trim();
  if (!out) {
    return '(none — HEAD matches baseline)';
  }
  const lines = out.split('\n');
  if (lines.length <= limit) {
    return lines.join('\n');
  }
  const hidden = lines.length - limit;
  return `${lines.slice(0, limit).join('\n')}\n… and ${hidden} more`;
}

export function sessionHasStoreVersions(session: ReleaseSession): boolean {
  const snapshot = session.storeVersions ?? {};
  if (includesAndroid(session.targetPlatform) && !snapshot.android) {
    return false;
  }
  if (includesIos(session.targetPlatform) && !snapshot.ios) {
    return false;
  }
  return true;
}
