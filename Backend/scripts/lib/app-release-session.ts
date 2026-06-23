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

export const releaseSessionSchema = z.object({
  baselineSha: z.string().min(1),
  headSha: z.string().min(1),
  current: nativeVersionSchema,
  planned: nativeVersionSchema,
  notes: releaseNotesSchema.nullable(),
});

export type ReleaseNotesSource = z.infer<typeof notesSourceSchema>;
export type ReleaseNotes = z.infer<typeof releaseNotesSchema>;
export type ReleaseSession = z.infer<typeof releaseSessionSchema>;

export function loadSession(): ReleaseSession | null {
  if (!fs.existsSync(SESSION_FILE)) {
    return null;
  }
  const raw = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8')) as unknown;
  return releaseSessionSchema.parse(raw);
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
