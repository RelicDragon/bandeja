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
