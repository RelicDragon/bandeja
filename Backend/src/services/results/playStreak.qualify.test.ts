import { EntityType } from '@prisma/client';
import { countsForPlayStreak } from './ratingActivity';
import {
  readSportStatsDeltasFromMetadata,
  mergeSportStatsDeltasMetadata,
  mergeRatingStatsAppliedMetadata,
} from './outcomeStatsSnapshot';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

/** Mirror of outcomeQualifiesForPlayStreak decision inputs used by backfill/apply. */
function qualifies(
  metadata: unknown,
  game: { affectsRating: boolean; entityType: EntityType },
): boolean {
  if (!countsForPlayStreak(game)) return false;
  const deltas = readSportStatsDeltasFromMetadata(metadata as never);
  if (deltas) return deltas.gamesPlayedDelta > 0;
  return game.affectsRating;
}

const ratedMeta = mergeSportStatsDeltasMetadata(
  mergeRatingStatsAppliedMetadata(undefined, true),
  { gamesPlayedDelta: 1, gamesWonDelta: 0 },
);
const nonRatedMeta = mergeSportStatsDeltasMetadata(
  mergeRatingStatsAppliedMetadata(undefined, false),
  { gamesPlayedDelta: 0, gamesWonDelta: 0 },
);

assert(
  !qualifies(ratedMeta, { affectsRating: true, entityType: EntityType.BAR }),
  'BAR+rated metadata excluded',
);
assert(
  !qualifies(ratedMeta, { affectsRating: true, entityType: EntityType.LEAGUE_SEASON }),
  'LEAGUE_SEASON excluded',
);
assert(
  !qualifies(nonRatedMeta, { affectsRating: false, entityType: EntityType.GAME }),
  'non-rating GAME excluded',
);
assert(
  !qualifies(ratedMeta, { affectsRating: false, entityType: EntityType.GAME }),
  'affectsRating false excluded even with stale metadata',
);
assert(
  qualifies(ratedMeta, { affectsRating: true, entityType: EntityType.LEAGUE }),
  'rated LEAGUE included',
);
assert(
  qualifies(ratedMeta, { affectsRating: true, entityType: EntityType.GAME }),
  'rated GAME included',
);
assert(
  !qualifies(undefined, { affectsRating: false, entityType: EntityType.TRAINING }),
  'TRAINING non-rating excluded',
);
assert(
  !countsForPlayStreak({ affectsRating: false, entityType: EntityType.TRAINING }),
  'TRAINING never for streak unless rated (product: non-rating)',
);

console.log('playStreak.qualify: OK');
