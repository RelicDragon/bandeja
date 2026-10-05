/**
 * Weekly pair streak — pure, no Prisma, no I/O.
 *
 * Consecutive weeks in which the two played at least one **rated** game
 * together on the same side. "Same side" is the pair detection rule
 * (`detectPairGameFacts`); "rated" and the week arithmetic are the individual
 * play streak's (`countsForPlayStreak`, `playStreak.ts`), so the two streaks
 * can never disagree about what a week or a qualifying game is.
 *
 * Computed on read: nothing is stored, so there is no counter to drift.
 */

import type { EntityType } from '@prisma/client';
import { countsForPlayStreak } from '../results/ratingActivity';
import { playStreakViewFromPlayAts, type PlayStreakView } from '../results/playStreak';

export interface PairStreakGame {
  entityType: EntityType;
  affectsRating: boolean;
  /** When the game counts for the streak: `finishedDate ?? endTime ?? startTime`, as for the solo streak. */
  playedAt: Date;
}

/** Only games the caller already confirmed as a same-side pair game. */
export function pairStreakPlayAts(games: readonly PairStreakGame[]): Date[] {
  return games
    .filter((game) => countsForPlayStreak(game))
    .map((game) => game.playedAt)
    .sort((a, b) => a.getTime() - b.getTime());
}

export function computePairStreak(
  games: readonly PairStreakGame[],
  timezone: string,
  now: Date = new Date(),
  options: { includeAtRisk: boolean } = { includeAtRisk: false },
): PlayStreakView {
  return playStreakViewFromPlayAts(pairStreakPlayAts(games), timezone, now, options);
}
