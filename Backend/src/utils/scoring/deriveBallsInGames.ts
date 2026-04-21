/**
 * Single source for persisted `ballsInGames`: classic tennis-style presets vs points/timed/custom.
 * When `scoringPreset` is null (custom points / legacy), uses winner + points cap heuristics.
 */
export function deriveBallsInGamesFromScoring(input: {
  scoringPreset?: string | null;
  winnerOfMatch?: string | null;
  maxTotalPointsPerSet?: number | null;
}): boolean {
  const preset = input.scoringPreset;
  if (preset != null && typeof preset === 'string' && preset.length > 0) {
    return preset.startsWith('CLASSIC_');
  }
  const winner = input.winnerOfMatch ?? 'BY_SCORES';
  const pts = input.maxTotalPointsPerSet ?? 0;
  return winner === 'BY_SETS' && pts === 0;
}
