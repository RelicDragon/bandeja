import { ScoringPreset } from '@prisma/client';
import { normalizeLegacyTimedScoringPreset as normalizeLegacyTimedScoringPresetCore } from '../../shared/gameFormat/legacyTimedPreset';

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
  const result = normalizeLegacyTimedScoringPresetCore(preset);
  return {
    scoringPreset: result.scoringPreset as ScoringPreset | null,
    matchTimerEnabled: result.matchTimerEnabled,
    bumpPointsCapTo21: result.bumpPointsCapTo21,
  };
}
