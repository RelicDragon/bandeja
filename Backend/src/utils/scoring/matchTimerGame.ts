import { ScoringPreset } from '@prisma/client';

export function isGameMatchTimerEnabled(game: {
  matchTimerEnabled?: boolean | null;
  scoringPreset?: ScoringPreset | null;
  matchTimedCapMinutes?: number | null;
}): boolean {
  const cap = game.matchTimedCapMinutes ?? 0;
  if (cap < 1) return false;
  if (game.matchTimerEnabled) return true;
  const p = game.scoringPreset;
  return p === ScoringPreset.TIMED || p === ScoringPreset.CLASSIC_TIMED;
}

/** Maps deprecated timed presets to structure + timer; idempotent for already-normal rows. */
export function normalizeLegacyTimedScoringPreset(preset: ScoringPreset | null): {
  scoringPreset: ScoringPreset | null;
  matchTimerEnabled: boolean;
  bumpPointsCapTo21: boolean;
} {
  if (preset === ScoringPreset.CLASSIC_TIMED) {
    return { scoringPreset: ScoringPreset.CLASSIC_SINGLE_SET, matchTimerEnabled: true, bumpPointsCapTo21: false };
  }
  if (preset === ScoringPreset.TIMED) {
    return { scoringPreset: ScoringPreset.POINTS_21, matchTimerEnabled: true, bumpPointsCapTo21: true };
  }
  return { scoringPreset: preset, matchTimerEnabled: false, bumpPointsCapTo21: false };
}
