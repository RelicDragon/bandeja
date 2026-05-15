import type { Game } from '@/types';

/** Fields that affect scoring rules and must stay in sync between shell game and results engine store. */
export const GAME_FORMAT_SYNC_KEYS = [
  'scoringPreset',
  'scoringMode',
  'fixedNumberOfSets',
  'maxTotalPointsPerSet',
  'maxPointsPerTeam',
  'winnerOfMatch',
  'winnerOfGame',
  'ballsInGames',
  'hasGoldenPoint',
  'pointsPerTie',
  'matchTimerEnabled',
  'matchTimedCapMinutes',
] as const satisfies readonly (keyof Game)[];

export function gameFormatFieldsDiffer(
  shell: Partial<Game> | null | undefined,
  engine: Partial<Game> | null | undefined
): boolean {
  if (!shell || !engine) return false;
  return GAME_FORMAT_SYNC_KEYS.some((k) => shell[k] !== engine[k]);
}

export function shouldSyncEngineGameFromShell(
  shell: Game,
  engine: Game | null | undefined
): boolean {
  if (!engine) return true;
  if (engine.resultsStatus !== shell.resultsStatus || engine.status !== shell.status) return true;
  return gameFormatFieldsDiffer(shell, engine);
}

/** Prefer engine snapshot but overlay format + shell-only display fields from the details page. */
export function mergeShellFieldsIntoEngineGame(shell: Game, engine: Game): Game {
  const formatPatch: Partial<Game> = {};
  for (const k of GAME_FORMAT_SYNC_KEYS) {
    if (shell[k] !== undefined) formatPatch[k] = shell[k] as never;
  }
  return {
    ...engine,
    ...formatPatch,
    photosCount: shell.photosCount,
    mainPhotoId: shell.mainPhotoId,
    resultsSentToTelegram: shell.resultsSentToTelegram,
    city: shell.city,
  };
}

export function resolveCurrentGameForResults(
  shell: Game | null | undefined,
  engine: Game | null | undefined
): Game | null {
  if (!shell && !engine) return null;
  if (!engine) return shell ?? null;
  if (!shell) return engine;
  const statusDiffers =
    shell.resultsStatus !== engine.resultsStatus || shell.status !== engine.status;
  if (statusDiffers) return shell;
  return mergeShellFieldsIntoEngineGame(shell, engine);
}
