import { EntityType } from '@prisma/client';
import { countsAsRatingActivity, countsForPlayStreak } from './ratingActivity';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(
  !countsForPlayStreak({ affectsRating: true, entityType: EntityType.BAR }),
  'BAR never counts',
);
assert(
  !countsForPlayStreak({ affectsRating: true, entityType: EntityType.LEAGUE_SEASON }),
  'LEAGUE_SEASON never counts',
);
assert(
  !countsForPlayStreak({ affectsRating: false, entityType: EntityType.GAME }),
  'non-rating GAME never counts',
);
assert(
  !countsForPlayStreak({ affectsRating: false, entityType: EntityType.TRAINING }),
  'TRAINING never counts for play streak',
);
assert(
  countsForPlayStreak({ affectsRating: true, entityType: EntityType.GAME }),
  'rated GAME counts',
);
assert(
  countsForPlayStreak({ affectsRating: true, entityType: EntityType.LEAGUE }),
  'rated LEAGUE fixture counts',
);
assert(
  countsForPlayStreak({ affectsRating: true, entityType: EntityType.TOURNAMENT }),
  'rated TOURNAMENT counts',
);
assert(
  !countsAsRatingActivity({ affectsRating: true, entityType: EntityType.BAR }),
  'BAR not rating activity',
);
assert(
  countsAsRatingActivity({ affectsRating: false, entityType: EntityType.TRAINING }),
  'TRAINING is rating activity',
);

console.log('ratingActivity: OK');
