/** Maps deprecated timed presets to structure + timer; idempotent for already-normal rows. */
export function normalizeLegacyTimedScoringPreset(preset: string | null): {
  scoringPreset: string | null;
  matchTimerEnabled: boolean;
  bumpPointsCapTo21: boolean;
} {
  if (preset === 'CLASSIC_TIMED') {
    return { scoringPreset: 'CLASSIC_SINGLE_SET', matchTimerEnabled: true, bumpPointsCapTo21: false };
  }
  if (preset === 'TIMED') {
    return { scoringPreset: 'POINTS_21', matchTimerEnabled: true, bumpPointsCapTo21: true };
  }
  return { scoringPreset: preset, matchTimerEnabled: false, bumpPointsCapTo21: false };
}
