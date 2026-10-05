import { DYNAMIC_DUO_THRESHOLDS } from '@shared/achievements';

export type DynamicDuoProgress = {
  wins: number;
  /** Next tier's threshold, or `null` once every tier is reached. */
  target: number | null;
  /** Highest tier reached (threshold), or `null` before the first. */
  reached: number | null;
  /** 0–1 toward `target` (1 when done). */
  fraction: number;
  remaining: number;
};

/** Progress of one pair along the Dynamic Duo ladder (match wins side by side). */
export function dynamicDuoProgress(rawWins: number): DynamicDuoProgress {
  const wins = Number.isFinite(rawWins) ? Math.max(0, Math.floor(rawWins)) : 0;
  const target = DYNAMIC_DUO_THRESHOLDS.find((threshold) => wins < threshold) ?? null;
  const reachedTiers = DYNAMIC_DUO_THRESHOLDS.filter((threshold) => wins >= threshold);
  const reached = reachedTiers.length > 0 ? reachedTiers[reachedTiers.length - 1]! : null;
  return {
    wins,
    target,
    reached,
    fraction: target === null ? 1 : wins / target,
    remaining: target === null ? 0 : target - wins,
  };
}
