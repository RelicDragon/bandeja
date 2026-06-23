import { execSync } from 'child_process';
import * as fs from 'fs';
import { z } from 'zod';
import { getAiService } from '../../src/services/ai/ai.service';
import {
  ANDROID_GRADLE,
  IOS_PBX,
  ROOT,
  commitCountSince,
  getHeadCommit,
  proposeNextRelease,
  readBaseline,
  readNativeVersions,
  writeNativeVersions,
  type NativeVersion,
} from './app-release';
import type { ReleaseSession } from './app-release-session';

export interface PreflightInfo {
  baselineSha: string;
  headSha: string;
  commitCount: number;
  current: NativeVersion;
  planned: NativeVersion;
  aiConfigured: boolean;
}

const versionInputSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    const parts = value.split('.');
    return parts.length > 0 && parts.every((part) => part !== '' && /^\d+$/.test(part));
  }, 'Use dot-separated numeric segments, e.g. 0.96.41');

const buildInputSchema = z.coerce.number().int().nonnegative();

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

export function createReleaseSession(headRef = 'HEAD'): ReleaseSession {
  const baselineSha = readBaseline();
  const headSha = getHeadCommit(headRef).sha;
  const current = readNativeVersions();
  const planned = proposeNextRelease(current);

  return {
    baselineSha,
    headSha,
    current,
    planned,
    notes: null,
    artifacts: {},
    store: {},
    autoCommit: undefined,
  };
}

export function runPreflight(session: ReleaseSession): PreflightInfo {
  const current = readNativeVersions();
  return {
    baselineSha: session.baselineSha,
    headSha: session.headSha,
    commitCount: commitCountSince(session.baselineSha, session.headSha),
    current,
    planned: session.planned,
    aiConfigured: getAiService().isConfigured(),
  };
}

export function parseVersionInput(value: string): string {
  return versionInputSchema.parse(value);
}

export function parseBuildInput(value: string): number {
  return buildInputSchema.parse(value);
}

export function applyPlannedVersions(session: ReleaseSession, options?: { dryRun?: boolean }): void {
  const dryRun = options?.dryRun ?? isDryRun();
  if (dryRun) {
    return;
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

export type ReleaseSessionPhase = 'planning' | 'ready-to-apply' | 'ready-to-build' | 'ready-to-upload';

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

  const hasArtifacts = Boolean(session.artifacts?.aab && session.artifacts?.ipa);
  if (!hasArtifacts) {
    return 'ready-to-build';
  }

  return 'ready-to-upload';
}

export function storeConfigComplete(store: ReleaseSession['store']): boolean {
  return Boolean(store.androidTrack) && store.iosSubmitForReview !== undefined;
}

export function formatCommitPreview(baselineSha: string, headSha: string, limit = 8): string {
  const out = execSync(
    `git log ${baselineSha}..${headSha} --reverse --format='%h %s'`,
    { cwd: ROOT, maxBuffer: 1024 * 1024 },
  )
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
