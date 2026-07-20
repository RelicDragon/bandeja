import { Sport } from '@prisma/client';
import {
  projectUserForSportContext,
  resolveSportLevelConfirmation,
} from './userSportProfile.service';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const user = {
  id: 'u1',
  approvedLevel: true,
  approvedById: 'padel-trainer',
  approvedWhen: new Date('2024-01-01'),
  sportProfiles: [
    {
      sport: Sport.PADEL,
      level: 3,
      reliability: 50,
      gamesPlayed: 5,
      gamesWon: 2,
      approvedLevel: true,
      approvedById: 'padel-trainer',
      approvedWhen: new Date('2024-01-01'),
    },
    {
      sport: Sport.TENNIS,
      level: 4,
      reliability: 40,
      gamesPlayed: 3,
      gamesWon: 1,
      approvedLevel: false,
      approvedById: null,
      approvedWhen: null,
    },
    {
      sport: Sport.BADMINTON,
      level: 2,
      reliability: 20,
      gamesPlayed: 1,
      gamesWon: 0,
      approvedLevel: true,
      approvedById: 'badminton-trainer',
      approvedWhen: new Date('2025-06-01'),
    },
  ],
};

const padel = resolveSportLevelConfirmation(user, Sport.PADEL);
assert(padel.approvedLevel === true, 'padel confirmed');
assert(padel.approvedById === 'padel-trainer', 'padel approver');

const tennis = resolveSportLevelConfirmation(user, Sport.TENNIS);
assert(tennis.approvedLevel === false, 'tennis not confirmed');
assert(tennis.approvedById === null, 'tennis no approver');

const projectedTennis = projectUserForSportContext(user, Sport.TENNIS);
assert(projectedTennis.level === 4, 'tennis level projected');
assert(projectedTennis.approvedLevel === false, 'tennis confirmation projected false');
assert(projectedTennis.approvedById === null, 'tennis approvedById projected null');
assert(!('sportProfiles' in projectedTennis), 'sportProfiles stripped');

const projectedBadminton = projectUserForSportContext(user, Sport.BADMINTON);
assert(projectedBadminton.approvedLevel === true, 'badminton confirmation projected');
assert(projectedBadminton.approvedById === 'badminton-trainer', 'badminton approver projected');
assert(
  projectedBadminton.approvedById !== user.approvedById,
  'non-padel projection must not keep padel user mirror approver',
);

const projectedPadel = projectUserForSportContext(user, Sport.PADEL);
assert(projectedPadel.approvedLevel === true, 'padel confirmation projected');
assert(projectedPadel.approvedById === 'padel-trainer', 'padel approver projected');

const mirrorOnly = projectUserForSportContext(
  {
    id: 'u2',
    approvedLevel: true,
    approvedById: 'legacy-trainer',
    approvedWhen: new Date('2023-01-01'),
  },
  Sport.PADEL,
);
assert(mirrorOnly.approvedLevel === true, 'padel user mirror used when no profiles');
assert(mirrorOnly.approvedById === 'legacy-trainer', 'padel mirror approver');

const mirrorTennis = projectUserForSportContext(
  {
    id: 'u2',
    approvedLevel: true,
    approvedById: 'legacy-trainer',
    approvedWhen: new Date('2023-01-01'),
  },
  Sport.TENNIS,
);
assert(mirrorTennis.approvedLevel === false, 'non-padel must not use user mirror');

const mirrorOnlyWithSlimPadelProfile = projectUserForSportContext(
  {
    id: 'u3',
    approvedLevel: true,
    approvedById: 'legacy-trainer',
    approvedWhen: new Date('2023-01-01'),
    sportProfiles: [
      {
        sport: Sport.PADEL,
        level: 3,
        reliability: 10,
        gamesPlayed: 1,
        gamesWon: 0,
        // approvedLevel omitted — mimics Find/slim selects before confirmation columns
      },
    ],
  },
  Sport.PADEL,
);
assert(
  mirrorOnlyWithSlimPadelProfile.approvedLevel === true,
  'slim padel profile without approvedLevel must fall back to User mirror',
);

const slimTennisNoConfirmField = projectUserForSportContext(
  {
    id: 'u4',
    approvedLevel: true,
    approvedById: 'legacy-trainer',
    approvedWhen: new Date('2023-01-01'),
    sportProfiles: [
      {
        sport: Sport.TENNIS,
        level: 4,
        reliability: 10,
        gamesPlayed: 1,
        gamesWon: 0,
      },
    ],
  },
  Sport.TENNIS,
);
assert(
  slimTennisNoConfirmField.approvedLevel === false,
  'slim tennis profile without approvedLevel must not inherit padel User mirror',
);

const findCardStyleTennis = projectUserForSportContext(
  {
    id: 'u5',
    approvedLevel: false,
    approvedById: null,
    approvedWhen: null,
    sportProfiles: [
      {
        sport: Sport.TENNIS,
        level: 4,
        reliability: 10,
        gamesPlayed: 1,
        gamesWon: 0,
        approvedLevel: true,
        approvedById: 'tennis-trainer',
        approvedWhen: new Date('2025-01-01'),
      },
    ],
  },
  Sport.TENNIS,
);
assert(findCardStyleTennis.approvedLevel === true, 'find-card tennis confirmation projects');
assert(findCardStyleTennis.approvedById === 'tennis-trainer', 'find-card tennis approver');

console.log('userSportProfile.confirmation.test: ok');
