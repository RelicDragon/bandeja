/**
 * Shared next-game picker golden runner (Vitest + Swift/Kotlin parity).
 *
 * Catalog: `Frontend/shared/nextGame/pickNextGameGolden.json`
 * Policy: `Frontend/shared/nextGame/policy.ts` (`NEXT_GAME_DISPLAY_POLICY`)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NEXT_GAME_DISPLAY_POLICY } from '@shared/nextGame/policy';
import { pickNextGame, type NextGameCandidate } from './pickNextGame';

/** Absolute path — independent of `process.cwd()` (Vitest / IDE / CI). */
export const PICK_NEXT_GAME_GOLDEN_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../shared/nextGame/pickNextGameGolden.json',
);

/** Acceptance cases from #273 — must remain present in the catalog. */
export const PICK_NEXT_GAME_REQUIRED_CASES = [
  'empty-list',
  'one-upcoming',
  'in-now-minus-1h-window',
  'finished-archived-excluded',
  'tie-break-by-startTime',
] as const;

export type PickNextGameGoldenCase = {
  name: string;
  reference: string;
  games: Array<{ id: string; startTime: string; status: string }>;
  expectedId: string | null;
};

export type PickNextGameGoldenCatalog = {
  policy: string;
  minCases: number;
  cases: PickNextGameGoldenCase[];
};

export function loadPickNextGameGoldenCatalog(): PickNextGameGoldenCatalog {
  const raw = JSON.parse(
    readFileSync(PICK_NEXT_GAME_GOLDEN_PATH, 'utf8'),
  ) as PickNextGameGoldenCatalog;
  if (!Array.isArray(raw.cases) || raw.cases.length === 0) {
    throw new Error('pickNextGameGolden.json must include a non-empty cases array');
  }
  if (raw.policy !== NEXT_GAME_DISPLAY_POLICY) {
    throw new Error(
      `pickNextGameGolden.json policy drift vs NEXT_GAME_DISPLAY_POLICY:\n` +
        `json: ${raw.policy}\n` +
        `ts:   ${NEXT_GAME_DISPLAY_POLICY}`,
    );
  }
  if (raw.cases.length < raw.minCases) {
    throw new Error(
      `pickNextGameGolden.json has ${raw.cases.length} cases; minCases=${raw.minCases}`,
    );
  }
  const names = new Set(raw.cases.map((c) => c.name));
  for (const required of PICK_NEXT_GAME_REQUIRED_CASES) {
    if (!names.has(required)) {
      throw new Error(`pickNextGameGolden.json missing required case "${required}"`);
    }
  }
  for (const c of raw.cases) {
    if (!c.name || !c.reference || !Array.isArray(c.games)) {
      throw new Error(`invalid golden case: ${JSON.stringify(c)}`);
    }
    if (c.expectedId !== null && typeof c.expectedId !== 'string') {
      throw new Error(`case "${c.name}" expectedId must be string|null`);
    }
  }
  return raw;
}

export function runPickNextGameGoldenCase(
  fixture: PickNextGameGoldenCase,
): string | undefined {
  const games: NextGameCandidate[] = fixture.games.map((g) => ({
    id: g.id,
    startTime: g.startTime,
    status: g.status,
  }));
  return pickNextGame(games, new Date(fixture.reference))?.id;
}
