/**
 * PRD 352 — folding {@link PairGameFact}s into `PairStat` rows. Pure, no Prisma.
 *
 * One aggregate per `(sport, cityId, userAId, userBId)` — exactly the model's
 * unique tuple. The pipeline recomputes a pair from scratch rather than
 * incrementing, which is what makes "write a result" and "reset a result"
 * symmetric for free: both end with the same function over the same facts.
 */

import type { Sport } from '@prisma/client';
import { pairStatKey, type PairGameFact } from './partnerDetection';
import type { PairIds } from './pairKey';

export interface PairStatAggregate extends PairIds {
  sport: Sport;
  cityId: string;
  games: number;
  wins: number;
  lastPlayedAt: Date | null;
}

/**
 * Group facts by the `PairStat` unique tuple. A pair that played in two cities
 * gets two aggregates — the leaderboard is per city, so that is the point.
 */
export function aggregatePairFacts(facts: readonly PairGameFact[]): PairStatAggregate[] {
  const byKey = new Map<string, PairStatAggregate>();

  for (const fact of facts) {
    const key = pairStatKey(fact);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        sport: fact.sport,
        cityId: fact.cityId,
        userAId: fact.userAId,
        userBId: fact.userBId,
        games: 1,
        wins: fact.won ? 1 : 0,
        lastPlayedAt: fact.playedAt,
      });
      continue;
    }
    existing.games += 1;
    if (fact.won) existing.wins += 1;
    if (!existing.lastPlayedAt || fact.playedAt.getTime() > existing.lastPlayedAt.getTime()) {
      existing.lastPlayedAt = fact.playedAt;
    }
  }

  return [...byKey.values()];
}

/**
 * Merge a batch of aggregates into a running accumulator. Used by the admin
 * rebuild, which flushes and clears the accumulator every game batch.
 */
export function mergePairAggregates(
  into: Map<string, PairStatAggregate>,
  incoming: readonly PairStatAggregate[],
): void {
  for (const next of incoming) {
    const key = pairStatKey(next);
    const existing = into.get(key);
    if (!existing) {
      into.set(key, { ...next });
      continue;
    }
    existing.games += next.games;
    existing.wins += next.wins;
    if (
      next.lastPlayedAt &&
      (!existing.lastPlayedAt || next.lastPlayedAt.getTime() > existing.lastPlayedAt.getTime())
    ) {
      existing.lastPlayedAt = next.lastPlayedAt;
    }
  }
}
