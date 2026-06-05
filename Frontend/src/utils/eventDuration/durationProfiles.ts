import type { ScoringPreset } from '@/types';

export type DurationProfile = {
  matchMinutes: number;
  roundGapMinutes: number;
};

const DEFAULT_PROFILE: DurationProfile = { matchMinutes: 15, roundGapMinutes: 2 };

const PROFILES: Partial<Record<ScoringPreset, DurationProfile>> = {
  POINTS_11: { matchMinutes: 10, roundGapMinutes: 2 },
  POINTS_12: { matchMinutes: 10, roundGapMinutes: 2 },
  POINTS_15: { matchMinutes: 11, roundGapMinutes: 2 },
  POINTS_16: { matchMinutes: 10, roundGapMinutes: 2 },
  POINTS_21: { matchMinutes: 12, roundGapMinutes: 2 },
  POINTS_24: { matchMinutes: 15, roundGapMinutes: 3 },
  POINTS_32: { matchMinutes: 18, roundGapMinutes: 3 },
  CLASSIC_BEST_OF_3: { matchMinutes: 75, roundGapMinutes: 0 },
  CLASSIC_BEST_OF_5: { matchMinutes: 110, roundGapMinutes: 0 },
  CLASSIC_SINGLE_SET: { matchMinutes: 40, roundGapMinutes: 0 },
  CLASSIC_PRO_SET: { matchMinutes: 45, roundGapMinutes: 0 },
  CLASSIC_SHORT_SET: { matchMinutes: 55, roundGapMinutes: 0 },
  CLASSIC_FAST4: { matchMinutes: 50, roundGapMinutes: 0 },
  CLASSIC_SUPER_TIEBREAK: { matchMinutes: 60, roundGapMinutes: 0 },
  CLASSIC_TIMED: { matchMinutes: 15, roundGapMinutes: 0 },
  BEST_OF_3_11: { matchMinutes: 25, roundGapMinutes: 0 },
  BEST_OF_3_15: { matchMinutes: 30, roundGapMinutes: 0 },
  BEST_OF_3_21: { matchMinutes: 35, roundGapMinutes: 0 },
  BEST_OF_5_11: { matchMinutes: 35, roundGapMinutes: 0 },
  PAR_11: { matchMinutes: 20, roundGapMinutes: 0 },
  SINGLE_GAME_21: { matchMinutes: 18, roundGapMinutes: 0 },
  TIMED: { matchMinutes: 15, roundGapMinutes: 0 },
  CUSTOM: { matchMinutes: 15, roundGapMinutes: 2 },
};

export function pointsFromScoringPreset(preset: ScoringPreset): number | null {
  const m = /^POINTS_(\d+)$/.exec(preset);
  return m ? Number(m[1]) : null;
}

export function matchMinutesFromPointsBudget(points: number): number {
  const raw = points * 0.55;
  return Math.min(25, Math.max(8, Math.round(raw)));
}

export function getDurationProfile(preset: ScoringPreset): DurationProfile {
  return PROFILES[preset] ?? DEFAULT_PROFILE;
}

export function resolveMatchMinutes(
  preset: ScoringPreset,
  opts: { matchTimerEnabled: boolean; matchTimedCapMinutes: number; customPointsTotal?: number | null },
): number {
  if (opts.matchTimerEnabled && opts.matchTimedCapMinutes > 0) {
    return opts.matchTimedCapMinutes;
  }
  const custom = opts.customPointsTotal;
  if (custom != null && custom > 0) {
    return matchMinutesFromPointsBudget(custom);
  }
  const fromPreset = pointsFromScoringPreset(preset);
  if (fromPreset != null) {
    return matchMinutesFromPointsBudget(fromPreset);
  }
  return getDurationProfile(preset).matchMinutes;
}

export function roundGapMinutesForPreset(preset: ScoringPreset): number {
  const pts = pointsFromScoringPreset(preset);
  if (pts != null) {
    return pts <= 16 ? 2 : 3;
  }
  return getDurationProfile(preset).roundGapMinutes;
}
