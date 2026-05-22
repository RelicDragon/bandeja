export function deriveBallsInGamesFromScoring(input: {
  scoringPreset?: string | null;
  winnerOfMatch?: string | null;
  maxTotalPointsPerSet?: number | null;
  sport?: string | null;
}): boolean {
  if (input.sport === 'TABLE_TENNIS') return false;
  const preset = input.scoringPreset;
  if (preset != null && typeof preset === 'string' && preset.length > 0) {
    return preset.startsWith('CLASSIC_');
  }
  const winner = input.winnerOfMatch ?? 'BY_SCORES';
  const pts = input.maxTotalPointsPerSet ?? 0;
  return winner === 'BY_SETS' && pts === 0;
}
