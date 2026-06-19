import { Sport } from '@prisma/client';
import {
  courtNamesConflictForSport,
  inferCourtSportFromBooktimeResource,
  type BooktimeResourceForSport,
} from './inferCourtSport';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const padelOnly: BooktimeResourceForSport = {
  name: 'Teren 1',
  group: { name: 'Padel' },
  services: [{ uuid: 'p1', name: 'Padel', isBookable: true }],
};

assert(
  inferCourtSportFromBooktimeResource(padelOnly) === Sport.PADEL,
  'padel-only resource maps to PADEL',
);

const dualUsePadelGroup: BooktimeResourceForSport = {
  name: 'Teren 1',
  group: { name: 'Padel' },
  services: [
    { uuid: 'p1', name: 'Padel', isBookable: true },
    { uuid: 't1', name: 'Tenis', isBookable: true },
  ],
};

assert(
  inferCourtSportFromBooktimeResource(dualUsePadelGroup) === Sport.PADEL,
  'padel group stays PADEL even when tenis service is also bookable',
);

const tennisGroup: BooktimeResourceForSport = {
  name: 'Teren 1',
  group: { name: 'Tenis' },
  services: [
    { uuid: 'p1', name: 'Padel', isBookable: true },
    { uuid: 't1', name: 'Tenis', isBookable: true },
  ],
};

assert(
  inferCourtSportFromBooktimeResource(tennisGroup) === Sport.TENNIS,
  'tenis group maps to TENNIS even when padel service exists',
);

assert(
  courtNamesConflictForSport(Sport.PADEL, Sport.TENNIS),
  'padel vs tennis is a name conflict',
);
assert(
  !courtNamesConflictForSport(Sport.PADEL, null),
  'padel vs multi-sport is not a conflict',
);

console.log('ok: inferCourtSport.test.ts');
