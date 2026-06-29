import assert from 'node:assert/strict';
import { Sport } from '@prisma/client';
import {
  computeUserSportProfileStatsFromOutcomes,
  UserGameStatsOutcome,
} from './userGameStatsRecompute.service';
import {
  mergeRatingStatsAppliedMetadata,
  mergeSportStatsDeltasMetadata,
} from '../results/outcomeStatsSnapshot';

function storedJson(value: unknown): UserGameStatsOutcome['metadata'] {
  return value as UserGameStatsOutcome['metadata'];
}

function outcome(
  sport: Sport,
  isWinner: boolean,
  affectsRating = true,
  metadata: UserGameStatsOutcome['metadata'] = null,
): UserGameStatsOutcome {
  return {
    isWinner,
    affectsRating,
    metadata,
    pointsEarned: 0,
    game: { sport, affectsRating },
  } as UserGameStatsOutcome;
}

const stats = computeUserSportProfileStatsFromOutcomes([
  outcome(Sport.PADEL, true),
  outcome(Sport.PADEL, false),
  outcome(Sport.PADEL, true, false, storedJson(mergeRatingStatsAppliedMetadata(null, false))),
  outcome(
    Sport.TENNIS,
    false,
    false,
    storedJson(mergeSportStatsDeltasMetadata(null, { gamesPlayedDelta: 1, gamesWonDelta: 0 })),
  ),
]);

assert.deepEqual(
  stats.sort((a, b) => a.sport.localeCompare(b.sport)),
  [
    { sport: Sport.PADEL, gamesPlayed: 2, gamesWon: 1 },
    { sport: Sport.TENNIS, gamesPlayed: 1, gamesWon: 0 },
  ].sort((a, b) => a.sport.localeCompare(b.sport)),
);

console.log('userGameStatsRecompute.service.test: ok');
