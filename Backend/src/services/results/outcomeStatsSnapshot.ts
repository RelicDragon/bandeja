import { Prisma } from '@prisma/client';

/** Persisted on GameOutcome.metadata — whether sport level / gamesPlayed / gamesWon were applied. */
export const RATING_STATS_APPLIED_KEY = 'ratingStatsApplied';
export const GAMES_PLAYED_DELTA_KEY = 'gamesPlayedDelta';
export const GAMES_WON_DELTA_KEY = 'gamesWonDelta';

export type SportStatsSnapshot = {
  level: number;
  reliability: number;
  gamesPlayed: number;
  gamesWon: number;
};

export type SportStatsDeltas = {
  gamesPlayedDelta: number;
  gamesWonDelta: number;
};

function readMetadataRecord(
  metadata: Prisma.JsonValue | null | undefined,
): Record<string, unknown> | undefined {
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }
  return metadata as Record<string, unknown>;
}

export function readRatingStatsAppliedFromMetadata(
  metadata: Prisma.JsonValue | null | undefined,
): boolean | undefined {
  const v = readMetadataRecord(metadata)?.[RATING_STATS_APPLIED_KEY];
  return typeof v === 'boolean' ? v : undefined;
}

export function readSportStatsDeltasFromMetadata(
  metadata: Prisma.JsonValue | null | undefined,
): SportStatsDeltas | undefined {
  const record = readMetadataRecord(metadata);
  if (!record) return undefined;
  const gamesPlayedDelta = record[GAMES_PLAYED_DELTA_KEY];
  const gamesWonDelta = record[GAMES_WON_DELTA_KEY];
  if (typeof gamesPlayedDelta !== 'number' || typeof gamesWonDelta !== 'number') {
    return undefined;
  }
  return { gamesPlayedDelta, gamesWonDelta };
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

export function mergeSportStatsDeltasMetadata(
  existing: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined,
  deltas: SportStatsDeltas,
): Prisma.InputJsonValue {
  const base: Record<string, unknown> =
    existing != null && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  base[GAMES_PLAYED_DELTA_KEY] = deltas.gamesPlayedDelta;
  base[GAMES_WON_DELTA_KEY] = deltas.gamesWonDelta;
  return base as Prisma.InputJsonValue;
}

export function computeSportStatsDeltas(
  ratingStatsApplied: boolean,
  isWinner: boolean,
): SportStatsDeltas {
  if (!ratingStatsApplied) {
    return { gamesPlayedDelta: 0, gamesWonDelta: 0 };
  }
  return {
    gamesPlayedDelta: 1,
    gamesWonDelta: isWinner ? 1 : 0,
  };
}

/** Undo reverses persisted deltas; legacy outcomes without metadata fall back to game.affectsRating. */
export function resolveSportStatsDeltasForUndo(
  outcomeMetadata: Prisma.JsonValue | null | undefined,
  isWinner: boolean,
  gameAffectsRating: boolean,
): SportStatsDeltas {
  const stored = readSportStatsDeltasFromMetadata(outcomeMetadata);
  if (stored) return stored;

  const ratingStatsApplied = readRatingStatsAppliedFromMetadata(outcomeMetadata);
  if (ratingStatsApplied === false) {
    return { gamesPlayedDelta: 0, gamesWonDelta: 0 };
  }
  if (ratingStatsApplied === true) {
    return computeSportStatsDeltas(true, isWinner);
  }

  return gameAffectsRating ? computeSportStatsDeltas(true, isWinner) : { gamesPlayedDelta: 0, gamesWonDelta: 0 };
}

/** Prod reconciliation: count legacy rated outcomes without persisted deltas. */
export function resolveSportStatsDeltasForReconcile(
  outcomeMetadata: Prisma.JsonValue | null | undefined,
  isWinner: boolean,
  gameAffectsRating: boolean,
): SportStatsDeltas {
  const stored = readSportStatsDeltasFromMetadata(outcomeMetadata);
  if (stored) return stored;

  const ratingStatsApplied = readRatingStatsAppliedFromMetadata(outcomeMetadata);
  if (ratingStatsApplied === false) {
    return { gamesPlayedDelta: 0, gamesWonDelta: 0 };
  }
  if (ratingStatsApplied === true) {
    return computeSportStatsDeltas(true, isWinner);
  }

  return gameAffectsRating ? computeSportStatsDeltas(true, isWinner) : { gamesPlayedDelta: 0, gamesWonDelta: 0 };
}

/** Undo must use stored flag/deltas when present — not isWinner alone. */
export function resolveRatingStatsAppliedForUndo(
  outcomeMetadata: Prisma.JsonValue | null | undefined,
  gameAffectsRating: boolean,
): boolean {
  const stored = readRatingStatsAppliedFromMetadata(outcomeMetadata);
  if (stored !== undefined) return stored;
  const deltas = readSportStatsDeltasFromMetadata(outcomeMetadata);
  if (deltas) return deltas.gamesPlayedDelta > 0;
  return gameAffectsRating;
}

export function clampSportLevel(level: number): number {
  return Math.max(1.0, Math.min(7.0, level));
}

export function clampReliability(reliability: number): number {
  return Math.max(0.0, Math.min(100.0, reliability));
}

export function clampSportProfileGameStats(
  gamesPlayed: number,
  gamesWon: number,
): Pick<SportStatsSnapshot, 'gamesPlayed' | 'gamesWon'> {
  const played = Math.max(0, gamesPlayed);
  const won = Math.max(0, Math.min(gamesWon, played));
  return { gamesPlayed: played, gamesWon: won };
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
      ...clampSportProfileGameStats(snapshot.gamesPlayed, snapshot.gamesWon),
    };
  }
  const deltas = computeSportStatsDeltas(ratingStatsApplied, isWinner);
  return {
    level: levelAfter,
    reliability: reliabilityAfter,
    ...clampSportProfileGameStats(
      snapshot.gamesPlayed + deltas.gamesPlayedDelta,
      snapshot.gamesWon + deltas.gamesWonDelta,
    ),
  };
}

export function computeUndoSportStatsFromDeltas(
  snapshot: SportStatsSnapshot,
  deltas: SportStatsDeltas,
): Pick<SportStatsSnapshot, 'gamesPlayed' | 'gamesWon'> {
  return clampSportProfileGameStats(
    snapshot.gamesPlayed - deltas.gamesPlayedDelta,
    snapshot.gamesWon - deltas.gamesWonDelta,
  );
}

/** @deprecated Prefer resolveSportStatsDeltasForUndo + computeUndoSportStatsFromDeltas. */
export function computeUndoSportStats(
  snapshot: SportStatsSnapshot,
  ratingStatsApplied: boolean,
  isWinner: boolean,
): Pick<SportStatsSnapshot, 'gamesPlayed' | 'gamesWon'> {
  return computeUndoSportStatsFromDeltas(
    snapshot,
    computeSportStatsDeltas(ratingStatsApplied, isWinner),
  );
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
