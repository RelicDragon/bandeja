/**
 * PRD 352 — materialization of `PairStat`.
 *
 * Two entry points, one algorithm:
 *
 * - {@link refreshPairStatsForGame} — post-commit hook for the outcomes
 *   pipeline. Called after a `GameOutcome` write **and** after a reset/undo.
 * - {@link rebuildPairStats} — admin `POST /rankings/pairs/recalculate`.
 *
 * Both end in {@link writePairAggregates}, which **recomputes a pair from
 * scratch** instead of incrementing. That is what makes apply and revert
 * symmetric: a reset deletes the `GameOutcome` rows, the recompute stops seeing
 * that game, and the pair's row lands back on exactly the totals it had before
 * — no signed deltas to get wrong, no drift after an edit.
 *
 * Nothing in this module may run inside the results transaction. It is a cache
 * of a derivable query; if it fails, the result is still correct and the admin
 * rebuild fixes the cache.
 */

import type { Prisma, Sport } from '@prisma/client';
import prisma from '../../config/database';
import { pairKey, type PairIds } from './pairKey';
import {
  detectPairGameFacts,
  pairPartnerCandidates,
  type PairGameFact,
} from './partnerDetection';
import { combinedLevelOf } from './pairRankingOrder';
import { aggregatePairFacts, mergePairAggregates, type PairStatAggregate } from './pairStatAggregate';
import {
  PAIR_STAT_GAME_SELECT,
  forEachPairDetectionGameBatch,
  loadPairDetectionGames,
  pairCountedGameWhere,
  toPairDetectionGame,
} from './pairStatGameLoad';

/** Rows written per flush during the admin rebuild. */
const PAIR_STAT_WRITE_BATCH = 200;

/** Games loaded per slice when recomputing a known set of pairs. */
const PAIR_REFRESH_GAME_BATCH = 50;

function uniqueUserIds(pairs: readonly PairIds[]): string[] {
  const seen = new Set<string>();
  for (const pair of pairs) {
    seen.add(pair.userAId);
    seen.add(pair.userBId);
  }
  return [...seen];
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Combined level
// ---------------------------------------------------------------------------

type LevelLookup = Map<string, number>;

function levelKey(userId: string, sport: Sport): string {
  return `${userId} ${sport}`;
}

async function loadLevels(userIds: readonly string[], sports: readonly Sport[]): Promise<LevelLookup> {
  const lookup: LevelLookup = new Map();
  if (userIds.length === 0 || sports.length === 0) return lookup;

  for (const slice of chunk(userIds, 500)) {
    const profiles = await prisma.userSportProfile.findMany({
      where: { userId: { in: slice }, sport: { in: [...sports] } },
      select: { userId: true, sport: true, level: true },
    });
    for (const profile of profiles) {
      lookup.set(levelKey(profile.userId, profile.sport), profile.level);
    }
  }
  return lookup;
}

function combinedLevelFor(aggregate: PairStatAggregate, levels: LevelLookup): number | null {
  return combinedLevelOf(
    levels.get(levelKey(aggregate.userAId, aggregate.sport)) ?? null,
    levels.get(levelKey(aggregate.userBId, aggregate.sport)) ?? null,
  );
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

function aggregateToCreate(
  aggregate: PairStatAggregate,
  levels: LevelLookup,
): Prisma.PairStatCreateManyInput {
  return {
    sport: aggregate.sport,
    cityId: aggregate.cityId,
    userAId: aggregate.userAId,
    userBId: aggregate.userBId,
    games: aggregate.games,
    wins: aggregate.wins,
    lastPlayedAt: aggregate.lastPlayedAt,
    combinedLevel: combinedLevelFor(aggregate, levels),
  };
}

/**
 * Replace every stored row for `pairs` with `aggregates`.
 *
 * The delete is scoped to the pairs we recomputed, so a pair that dropped to
 * zero counted games in a city loses its row instead of keeping a stale one.
 * `userAId < userBId` is guaranteed upstream by `orderPairIds`; this function
 * asserts it rather than trusting it, because a mirrored row would silently
 * become a second aggregate for the same two people.
 */
async function writePairAggregates(
  pairs: readonly PairIds[],
  aggregates: readonly PairStatAggregate[],
): Promise<void> {
  if (pairs.length === 0) return;

  for (const aggregate of aggregates) {
    if (!(aggregate.userAId < aggregate.userBId)) {
      throw new Error(
        `PairStat ordering invariant violated for ${aggregate.userAId}/${aggregate.userBId}`,
      );
    }
  }

  const levels = await loadLevels(
    uniqueUserIds(pairs),
    [...new Set(aggregates.map((aggregate) => aggregate.sport))],
  );

  const rows = aggregates.map((aggregate) => aggregateToCreate(aggregate, levels));

  await prisma.$transaction(async (tx) => {
    await tx.pairStat.deleteMany({
      where: {
        OR: pairs.map((pair) => ({ userAId: pair.userAId, userBId: pair.userBId })),
      },
    });
    if (rows.length > 0) {
      await tx.pairStat.createMany({ data: rows, skipDuplicates: true });
    }
  });
}

// ---------------------------------------------------------------------------
// Per-game refresh (the outcomes pipeline hook)
// ---------------------------------------------------------------------------

/**
 * The pairs a game can possibly affect: everyone who shared a side in it.
 *
 * **Call this before any transaction that deletes rosters.** `resetGameResults`
 * and `deleteGameResults` drop `Team` / `TeamPlayer`, so after they commit the
 * generated-format side information is gone and the affected pairs can no
 * longer be derived from the game.
 */
export async function collectPairRefreshTargets(gameId: string): Promise<PairIds[]> {
  const row = await prisma.game.findUnique({
    where: { id: gameId },
    select: PAIR_STAT_GAME_SELECT,
  });
  if (!row) return [];
  return pairPartnerCandidates(toPairDetectionGame(row));
}

/**
 * Recompute the stored totals of `pairs` from every counted game they share.
 * Idempotent and safe to call twice.
 */
export async function refreshPairStatsForPairs(pairs: readonly PairIds[]): Promise<number> {
  if (pairs.length === 0) return 0;

  const targetKeys = new Set(pairs.map((pair) => pairKey(pair.userAId, pair.userBId)));
  const userIds = uniqueUserIds(pairs);

  const outcomeRows = await prisma.gameOutcome.findMany({
    where: { userId: { in: userIds }, game: pairCountedGameWhere() },
    select: { gameId: true, userId: true },
  });

  const usersByGame = new Map<string, Set<string>>();
  for (const row of outcomeRows) {
    const set = usersByGame.get(row.gameId);
    if (set) set.add(row.userId);
    else usersByGame.set(row.gameId, new Set([row.userId]));
  }

  const gameIds: string[] = [];
  for (const [gameId, users] of usersByGame) {
    if (users.size < 2) continue;
    const touchesTarget = pairs.some(
      (pair) => users.has(pair.userAId) && users.has(pair.userBId),
    );
    if (touchesTarget) gameIds.push(gameId);
  }

  const facts: PairGameFact[] = [];
  for (const slice of chunk(gameIds, PAIR_REFRESH_GAME_BATCH)) {
    const games = await loadPairDetectionGames(slice);
    for (const game of games) {
      for (const fact of detectPairGameFacts(game)) {
        if (targetKeys.has(pairKey(fact.userAId, fact.userBId))) facts.push(fact);
      }
    }
  }

  const aggregates = aggregatePairFacts(facts);
  await writePairAggregates(pairs, aggregates);
  return aggregates.length;
}

/**
 * PRD 352 — refresh `combinedLevel` on every pair a player belongs to.
 *
 * `combinedLevel` is the one `PairStat` column that does **not** come from
 * games: it is read from `UserSportProfile`, so an admin adjustment or an
 * external-rating import moves it with no outcome to hang a refresh on. Games
 * and wins are untouched here — only the display level is rewritten.
 *
 * Never throws: pair stats are a derived cache and must not be able to break a
 * level write.
 */
export async function refreshPairCombinedLevelsForUser(
  userId: string,
  sport?: Sport,
): Promise<void> {
  try {
    const rows = await prisma.pairStat.findMany({
      where: {
        ...(sport ? { sport } : {}),
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      select: { id: true, sport: true, userAId: true, userBId: true },
    });
    if (rows.length === 0) return;

    for (const slice of chunk(rows, PAIR_STAT_WRITE_BATCH)) {
      const levels = await loadLevels(
        uniqueUserIds(slice),
        [...new Set(slice.map((row) => row.sport))],
      );
      for (const row of slice) {
        await prisma.pairStat.update({
          where: { id: row.id },
          data: {
            combinedLevel: combinedLevelOf(
              levels.get(levelKey(row.userAId, row.sport)) ?? null,
              levels.get(levelKey(row.userBId, row.sport)) ?? null,
            ),
          },
        });
      }
    }
  } catch (error) {
    console.error('[pairStat] combinedLevel refresh failed', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Post-commit hook for one game. Never throws — pair stats are a derived cache
 * and must not be able to break finalization or a reset.
 *
 * `targets` lets a destructive caller pass the roster-derived pairs it captured
 * *before* its transaction (see {@link collectPairRefreshTargets}).
 */
export async function refreshPairStatsForGame(
  gameId: string,
  targets?: readonly PairIds[],
): Promise<void> {
  try {
    const pairs = targets && targets.length > 0 ? targets : await collectPairRefreshTargets(gameId);
    if (pairs.length === 0) return;
    await refreshPairStatsForPairs(pairs);
  } catch (error) {
    console.error(`[PairStat] refresh failed for game ${gameId}:`, error);
  }
}

// ---------------------------------------------------------------------------
// Admin rebuild
// ---------------------------------------------------------------------------

export interface PairStatRebuildOptions {
  sport?: Sport;
  cityId?: string;
}

export interface PairStatRebuildResult {
  gamesScanned: number;
  pairsWritten: number;
}

/**
 * Rebuild `PairStat` from scratch, in batches.
 *
 * Memory is bounded by one game batch: each slice of games is folded into an
 * accumulator that is flushed and cleared before the next slice is read, so the
 * table can be larger than RAM. Flushes use `upsert`-style increments because
 * the same pair can appear in many slices.
 */
export async function rebuildPairStats(
  options: PairStatRebuildOptions = {},
): Promise<PairStatRebuildResult> {
  const scopeWhere: Prisma.GameWhereInput = {
    ...(options.sport ? { sport: options.sport } : {}),
    ...(options.cityId ? { cityId: options.cityId } : {}),
  };

  await prisma.pairStat.deleteMany({
    where: {
      ...(options.sport ? { sport: options.sport } : {}),
      ...(options.cityId ? { cityId: options.cityId } : {}),
    },
  });

  let pairsWritten = 0;

  const flush = async (accumulator: Map<string, PairStatAggregate>): Promise<void> => {
    if (accumulator.size === 0) return;
    const aggregates = [...accumulator.values()];
    accumulator.clear();

    for (const slice of chunk(aggregates, PAIR_STAT_WRITE_BATCH)) {
      for (const aggregate of slice) {
        await prisma.pairStat.upsert({
          where: {
            sport_cityId_userAId_userBId: {
              sport: aggregate.sport,
              cityId: aggregate.cityId,
              userAId: aggregate.userAId,
              userBId: aggregate.userBId,
            },
          },
          create: {
            sport: aggregate.sport,
            cityId: aggregate.cityId,
            userAId: aggregate.userAId,
            userBId: aggregate.userBId,
            games: aggregate.games,
            wins: aggregate.wins,
            lastPlayedAt: aggregate.lastPlayedAt,
          },
          update: {
            games: { increment: aggregate.games },
            wins: { increment: aggregate.wins },
            ...(aggregate.lastPlayedAt ? { lastPlayedAt: aggregate.lastPlayedAt } : {}),
          },
        });
        pairsWritten += 1;
      }
    }
  };

  const accumulator = new Map<string, PairStatAggregate>();

  const gamesScanned = await forEachPairDetectionGameBatch(scopeWhere, async (games) => {
    const facts: PairGameFact[] = [];
    for (const game of games) facts.push(...detectPairGameFacts(game));
    mergePairAggregates(accumulator, aggregatePairFacts(facts));
    await flush(accumulator);
  });

  await flush(accumulator);
  await backfillCombinedLevels(options);

  return { gamesScanned, pairsWritten };
}

/**
 * Fill `combinedLevel` after a rebuild, in batches. Display only — it never
 * feeds rating, and a missing `UserSportProfile` leaves it `null` rather than
 * inventing a level.
 */
async function backfillCombinedLevels(options: PairStatRebuildOptions): Promise<void> {
  let cursor: string | undefined;

  for (;;) {
    const rows = await prisma.pairStat.findMany({
      where: {
        ...(options.sport ? { sport: options.sport } : {}),
        ...(options.cityId ? { cityId: options.cityId } : {}),
      },
      select: { id: true, sport: true, userAId: true, userBId: true },
      orderBy: { id: 'asc' },
      take: PAIR_STAT_WRITE_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]!.id;

    const levels = await loadLevels(
      uniqueUserIds(rows),
      [...new Set(rows.map((row) => row.sport))],
    );

    for (const row of rows) {
      const combinedLevel = combinedLevelOf(
        levels.get(levelKey(row.userAId, row.sport)) ?? null,
        levels.get(levelKey(row.userBId, row.sport)) ?? null,
      );
      await prisma.pairStat.update({ where: { id: row.id }, data: { combinedLevel } });
    }

    if (rows.length < PAIR_STAT_WRITE_BATCH) break;
  }
}
