import { Sports, type Sport } from '@shared/sport';

export type SportDurationLevelScale = {
  anchorMin: number;
  sportMax: number;
  maxRatio: number;
};

export const SPORT_DURATION_LEVEL_SCALE: Record<Sport, SportDurationLevelScale> = {
  [Sports.PADEL]: { anchorMin: 1.0, sportMax: 6.5, maxRatio: 3.0 },
  [Sports.TENNIS]: { anchorMin: 1.0, sportMax: 6.5, maxRatio: 2.5 },
  [Sports.PICKLEBALL]: { anchorMin: 1.0, sportMax: 6.5, maxRatio: 2.5 },
  [Sports.BADMINTON]: { anchorMin: 1.0, sportMax: 6.5, maxRatio: 2.5 },
  [Sports.TABLE_TENNIS]: { anchorMin: 1.0, sportMax: 6.5, maxRatio: 2.0 },
  [Sports.SQUASH]: { anchorMin: 1.0, sportMax: 6.5, maxRatio: 2.5 },
};

export function resolveEffectivePlayLevel(input: {
  creatorLevel: number;
  playerLevelRange: [number, number];
  invitedLevels: number[];
}): number {
  const bandMid = (input.playerLevelRange[0] + input.playerLevelRange[1]) / 2;
  const withLevels = input.invitedLevels.filter((l) => typeof l === 'number' && !Number.isNaN(l));
  if (withLevels.length >= 2) {
    const avg = withLevels.reduce((a, b) => a + b, 0) / withLevels.length;
    return 0.6 * bandMid + 0.4 * avg;
  }
  return input.creatorLevel;
}

export function levelDurationCoefficient(sport: Sport, effectiveLevel: number): number {
  const scale = SPORT_DURATION_LEVEL_SCALE[sport];
  const span = scale.sportMax - scale.anchorMin;
  if (span <= 0) return 1;
  const t = Math.min(1, Math.max(0, (effectiveLevel - scale.anchorMin) / span));
  return Math.pow(scale.maxRatio, t);
}

export function applyLevelToMatchMinutes(
  sport: Sport,
  matchMinutes: number,
  effectiveLevel: number,
): number {
  return Math.round(matchMinutes * levelDurationCoefficient(sport, effectiveLevel));
}
