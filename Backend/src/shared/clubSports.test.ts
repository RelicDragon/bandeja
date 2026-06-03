import { Sport } from '@prisma/client';
import {
  assertClubSportsCoverCourtSports,
  assertCourtSportInClub,
  normalizeClubSportsOrder,
  parseClubSportsInput,
} from './clubSports';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function assertThrows(fn: () => void, msg: string): void {
  try {
    fn();
    console.error('FAIL: expected throw:', msg);
    process.exit(1);
  } catch {
    /* expected */
  }
}

assert(
  normalizeClubSportsOrder([Sport.TENNIS, Sport.PADEL]).join() === 'PADEL,TENNIS',
  'normalize order',
);

assert(parseClubSportsInput(['TENNIS', 'PADEL', 'TENNIS']).join() === 'PADEL,TENNIS', 'parse dedupes');

assertThrows(() => parseClubSportsInput([]), 'empty sports');
assertThrows(() => parseClubSportsInput(['FOO']), 'invalid sport');

assertCourtSportInClub([Sport.PADEL], Sport.PADEL);
assertThrows(
  () => assertCourtSportInClub([Sport.PADEL], Sport.TENNIS),
  'court sport not in club',
);

assertClubSportsCoverCourtSports([Sport.PADEL, Sport.TENNIS], [Sport.PADEL, null]);
assertThrows(
  () => assertClubSportsCoverCourtSports([Sport.PADEL], [Sport.TENNIS]),
  'courts not covered',
);

console.log('ok: clubSports.test.ts');
