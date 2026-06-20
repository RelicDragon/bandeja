/** Keep in sync with Frontend/shared/gameFormatUpdateKeys.ts — enforced by sharedModuleParity.test.ts */

/** Scalar game fields changed by the format wizard / teams UI (not general game settings). */
export const GAME_FORMAT_UPDATE_KEYS = new Set([
  'gameType',
  'scoringMode',
  'scoringPreset',
  'fixedNumberOfSets',
  'maxTotalPointsPerSet',
  'matchTimedCapMinutes',
  'matchTimerEnabled',
  'maxPointsPerTeam',
  'winnerOfGame',
  'winnerOfMatch',
  'matchGenerationType',
  'pointsPerWin',
  'pointsPerLoose',
  'pointsPerTie',
  'ballsInGames',
  'deucesBeforeGoldenPoint',
  'playersPerMatch',
  'hasFixedTeams',
  'allowUserInMultipleTeams',
  'genderTeams',
  'resultsRoundGenV2',
  'affectsRating',
]);

/** Legacy FE field — accepted on write, normalized to `deucesBeforeGoldenPoint`. */
export const LEGACY_GAME_FORMAT_UPDATE_KEYS = new Set(['hasGoldenPoint']);

export function isGameFormatOnlyUpdate(data: Record<string, unknown>): boolean {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  if (keys.length === 0) return false;
  return keys.every(
    (k) => GAME_FORMAT_UPDATE_KEYS.has(k) || LEGACY_GAME_FORMAT_UPDATE_KEYS.has(k),
  );
}

/** Format keys stripped from TRAINING game updates (all wizard fields except rating toggle). */
export const TRAINING_STRIPPED_FORMAT_KEYS = [...GAME_FORMAT_UPDATE_KEYS].filter(
  (k) => k !== 'affectsRating',
);
