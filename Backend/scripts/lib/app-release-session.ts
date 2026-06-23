import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { ROOT } from './app-release';

export const SESSION_DIR = path.join(ROOT, '.app-release');
export const SESSION_FILE = path.join(SESSION_DIR, 'session.json');

const notesSourceSchema = z.enum(['ai', 'custom', 'template']);

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

export const releaseSessionSchema = z.object({
  baselineSha: z.string().min(1),
  headSha: z.string().min(1),
  current: nativeVersionSchema,
  planned: nativeVersionSchema,
  notes: releaseNotesSchema.nullable(),
  artifacts: artifactsSchema,
  store: storeSchema,
  autoCommit: z.boolean().optional(),
});

export type ReleaseNotesSource = z.infer<typeof notesSourceSchema>;
export type ReleaseNotes = z.infer<typeof releaseNotesSchema>;
export type ReleaseArtifacts = z.infer<typeof artifactsSchema>;
export type ReleaseStoreConfig = z.infer<typeof storeSchema>;
export type ReleaseSession = z.infer<typeof releaseSessionSchema>;

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
