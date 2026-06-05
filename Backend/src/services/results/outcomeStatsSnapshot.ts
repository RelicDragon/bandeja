import { Prisma } from '@prisma/client';

/** Persisted on GameOutcome.metadata — whether sport level / gamesPlayed / gamesWon were applied. */
export const RATING_STATS_APPLIED_KEY = 'ratingStatsApplied';

export type SportStatsSnapshot = {
  level: number;
  reliability: number;
  gamesPlayed: number;
  gamesWon: number;
};

export function readRatingStatsAppliedFromMetadata(
  metadata: Prisma.JsonValue | null | undefined,
): boolean | undefined {
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }
  const v = (metadata as Record<string, unknown>)[RATING_STATS_APPLIED_KEY];
  return typeof v === 'boolean' ? v : undefined;
}

export function mergeRatingStatsAppliedMetadata(
  existing: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined,
  ratingStatsApplied: boolean,
): Prisma.InputJsonValue {
  const base: Record<string, unknown> =
    existing != null && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  base[RATING_STATS_APPLIED_KEY] = ratingStatsApplied;
  return base as Prisma.InputJsonValue;
}

/** Undo must use stored flag when game.affectsRating was toggled after finalize. */
export function resolveRatingStatsAppliedForUndo(
  outcomeMetadata: Prisma.JsonValue | null | undefined,
  gameAffectsRating: boolean,
): boolean {
  return readRatingStatsAppliedFromMetadata(outcomeMetadata) ?? gameAffectsRating;
}

export function clampSportLevel(level: number): number {
  return Math.max(1.0, Math.min(7.0, level));
}

export function clampReliability(reliability: number): number {
  return Math.max(0.0, Math.min(100.0, reliability));
}

export function computeLevelAfter(levelBefore: number, levelChange: number): number {
  return clampSportLevel(levelBefore + levelChange);
}

export function computeApplySportStats(
  snapshot: SportStatsSnapshot,
  ratingStatsApplied: boolean,
  levelAfter: number,
  reliabilityAfter: number,
  isWinner: boolean,
): SportStatsSnapshot {
  if (!ratingStatsApplied) {
    return {
      level: snapshot.level,
      reliability: reliabilityAfter,
      gamesPlayed: snapshot.gamesPlayed,
      gamesWon: snapshot.gamesWon,
    };
  }
  return {
    level: levelAfter,
    reliability: reliabilityAfter,
    gamesPlayed: snapshot.gamesPlayed + 1,
    gamesWon: isWinner ? snapshot.gamesWon + 1 : snapshot.gamesWon,
  };
}

export function computeUndoSportStats(
  snapshot: SportStatsSnapshot,
  ratingStatsApplied: boolean,
  isWinner: boolean,
): Pick<SportStatsSnapshot, 'gamesPlayed' | 'gamesWon'> {
  if (!ratingStatsApplied) {
    return { gamesPlayed: snapshot.gamesPlayed, gamesWon: snapshot.gamesWon };
  }
  return {
    gamesPlayed: snapshot.gamesPlayed > 0 ? snapshot.gamesPlayed - 1 : 0,
    gamesWon: isWinner && snapshot.gamesWon > 0 ? snapshot.gamesWon - 1 : snapshot.gamesWon,
  };
}

export function computeUndoTotalPoints(
  currentTotalPoints: number,
  pointsEarned: number,
  ratingStatsApplied: boolean,
): number {
  if (!ratingStatsApplied || pointsEarned <= 0) return currentTotalPoints;
  return Math.max(0, currentTotalPoints - pointsEarned);
}

/** Level history events for non-rating games keep level flat; rating games only when level moved. */
export function shouldCreateGameLevelChangeEvent(
  affectsRating: boolean,
  levelChange: number,
): boolean {
  return !affectsRating || Math.abs(levelChange) > 1e-9;
}

export function resolveGameLevelChangeEventLevels(
  affectsRating: boolean,
  levelBefore: number,
  levelAfterFromOutcome: number,
): { levelBefore: number; levelAfter: number } {
  if (!affectsRating) {
    return { levelBefore, levelAfter: levelBefore };
  }
  return { levelBefore, levelAfter: levelAfterFromOutcome };
}
