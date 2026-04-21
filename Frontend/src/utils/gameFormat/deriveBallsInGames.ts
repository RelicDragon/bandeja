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
