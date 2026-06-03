import { SportLevelSource } from '@prisma/client';
import { isUnusedSportProfile } from './userSportProfile.service';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const fresh = {
  level: 1.0,
  reliability: 0,
  gamesPlayed: 0,
  gamesWon: 0,
  levelSource: SportLevelSource.DEFAULT,
  questionnaireCompletedAt: null,
  questionnaireSkippedAt: null,
  externalRatingHint: null,
};

assert(isUnusedSportProfile(fresh, 0), 'fresh profile unused');
assert(isUnusedSportProfile(null, 0), 'missing profile unused');
assert(!isUnusedSportProfile({ ...fresh, gamesPlayed: 1 }, 0), 'gamesPlayed blocks delete');
assert(!isUnusedSportProfile(fresh, 2), 'participation blocks delete');
assert(
  !isUnusedSportProfile({ ...fresh, questionnaireCompletedAt: new Date() }, 0),
  'questionnaire blocks delete',
);
assert(!isUnusedSportProfile({ ...fresh, level: 2.5 }, 0), 'non-default level blocks delete');
assert(
  !isUnusedSportProfile({ ...fresh, levelSource: SportLevelSource.MANUAL }, 0),
  'manual level blocks delete',
);

console.log('userSportProfile.removal.test: ok');
