/** Keep in sync with Backend/src/shared/gameFormatUpdateKeys.ts */

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
  'hasGoldenPoint',
  'playersPerMatch',
  'hasFixedTeams',
  'allowUserInMultipleTeams',
  'genderTeams',
  'resultsRoundGenV2',
  'affectsRating',
]);

export function isGameFormatOnlyUpdate(data: Record<string, unknown>): boolean {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  if (keys.length === 0) return false;
  return keys.every((k) => GAME_FORMAT_UPDATE_KEYS.has(k));
}

/** Format keys stripped from TRAINING game updates (all wizard fields except rating toggle). */
export const TRAINING_STRIPPED_FORMAT_KEYS = [...GAME_FORMAT_UPDATE_KEYS].filter(
  (k) => k !== 'affectsRating',
);
