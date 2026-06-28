import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { ROOT } from './app-release';

export const SESSION_DIR = path.join(ROOT, '.app-release');
export const SESSION_FILE = path.join(SESSION_DIR, 'session.json');

const notesSourceSchema = z.enum(['ai', 'custom', 'template']);
const releasePlatformSchema = z.enum(['android', 'ios', 'both']);

const releaseNotesSchema = z.object({
  main: z.string().min(1),
  short: z.string().min(1).optional(),
  source: notesSourceSchema,
});

const nativeVersionSchema = z.object({
  version: z.string().min(1),
  build: z.number().int().nonnegative(),
});

const artifactsSchema = z
  .object({
    aab: z.string().min(1).optional(),
    ipa: z.string().min(1).optional(),
  })
  .default({});

const storeSchema = z
  .object({
    androidTrack: z.string().min(1).optional(),
    iosSubmitForReview: z.boolean().optional(),
  })
  .default({});

const uploadStatusSchema = z
  .object({
    android: z.boolean().optional(),
    androidStoreVerified: z.boolean().optional(),
    ios: z.boolean().optional(),
    iosBinary: z.boolean().optional(),
    iosBuildProcessed: z.boolean().optional(),
    iosStoreVersion: z.boolean().optional(),
    iosStoreVersionVerified: z.boolean().optional(),
    storesVerified: z.boolean().optional(),
    androidStoreVerifiedAt: z.string().min(1).optional(),
    iosBinaryUploadedAt: z.string().min(1).optional(),
    iosBuildProcessedAt: z.string().min(1).optional(),
    iosStoreVersionUpdatedAt: z.string().min(1).optional(),
    iosStoreVersionVerifiedAt: z.string().min(1).optional(),
    storesVerifiedAt: z.string().min(1).optional(),
  })
  .default({});

const iosAppStoreConnectStateSchema = z
  .object({
    appStoreVersionId: z.string().min(1).optional(),
    buildId: z.string().min(1).optional(),
    lastObservedProcessingStatus: z.string().min(1).optional(),
    metadataUpdatedAt: z.string().min(1).optional(),
    submissionId: z.string().min(1).optional(),
  })
  .default({});

export const releaseSessionSchema = z.object({
  baselineSha: z.string().min(1),
  headSha: z.string().min(1),
  targetPlatform: releasePlatformSchema.default('both'),
  current: nativeVersionSchema,
  planned: nativeVersionSchema,
  notes: releaseNotesSchema.nullable(),
  artifacts: artifactsSchema,
  store: storeSchema,
  uploads: uploadStatusSchema,
  iosAppStoreConnect: iosAppStoreConnectStateSchema,
  autoCommit: z.boolean().optional(),
});

export type ReleaseNotesSource = z.infer<typeof notesSourceSchema>;
export type ReleasePlatform = z.infer<typeof releasePlatformSchema>;
export type ReleaseNotes = z.infer<typeof releaseNotesSchema>;
export type ReleaseArtifacts = z.infer<typeof artifactsSchema>;
export type ReleaseStoreConfig = z.infer<typeof storeSchema>;
export type ReleaseUploadStatus = z.infer<typeof uploadStatusSchema>;
export type IosAppStoreConnectState = z.infer<typeof iosAppStoreConnectStateSchema>;
export type ReleaseSession = z.infer<typeof releaseSessionSchema>;

export function includesAndroid(platform: ReleasePlatform | undefined): boolean {
  return platform === undefined || platform === 'both' || platform === 'android';
}

export function includesIos(platform: ReleasePlatform | undefined): boolean {
  return platform === undefined || platform === 'both' || platform === 'ios';
}

export function releasePlatformLabel(platform: ReleasePlatform | undefined): string {
  if (platform === 'android') {
    return 'Android';
  }
  if (platform === 'ios') {
    return 'iOS';
  }
  return 'Android + iOS';
}

export function loadSession(): ReleaseSession | null {
  if (!fs.existsSync(SESSION_FILE)) {
    return null;
  }
  const raw = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8')) as unknown;
  return releaseSessionSchema.parse(raw);
}

export function tryLoadSession(): ReleaseSession | null {
  try {
    return loadSession();
  } catch {
    return null;
  }
}

export function saveSession(session: ReleaseSession): void {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  fs.writeFileSync(SESSION_FILE, `${JSON.stringify(session, null, 2)}\n`, 'utf-8');
}

export function clearSession(): void {
  if (fs.existsSync(SESSION_FILE)) {
    fs.unlinkSync(SESSION_FILE);
  }
}

export function hasSavedSession(): boolean {
  return fs.existsSync(SESSION_FILE);
}

export function cleanReleaseWorkspace(options?: { buildArtifacts?: boolean }): void {
  clearSession();
  if (!options?.buildArtifacts) {
    return;
  }

  for (const subdir of ['ios', 'upload']) {
    const target = path.join(SESSION_DIR, subdir);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
}
