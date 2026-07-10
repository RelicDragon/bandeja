import { EntityType } from '@prisma/client';
import { ApiError } from '../ApiError';
import {
  assertMaxParticipantsWithinUserCap,
  maxParticipantsLimitForActor,
} from './userMaxParticipantsCap';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function assertThrows(fn: () => void, msg: string): void {
  try {
    fn();
    console.error('FAIL: expected throw —', msg);
    process.exit(1);
  } catch {
    // expected
  }
}

const actor = { canCreateTournament: false, maxParticipantsInGame: 12 };

assert(
  maxParticipantsLimitForActor(false, actor, EntityType.GAME) === 4,
  'games capped at 4',
);
assert(
  maxParticipantsLimitForActor(false, actor, EntityType.TOURNAMENT) === 12,
  'tournaments capped at 12 for normal users',
);
assert(
  maxParticipantsLimitForActor(
    false,
    { canCreateTournament: true, maxParticipantsInGame: 12 },
    EntityType.TOURNAMENT,
  ) === Number.POSITIVE_INFINITY,
  'canCreateTournament removes tournament cap',
);

assertThrows(
  () =>
    assertMaxParticipantsWithinUserCap({
      jwtIsAdmin: false,
      actor,
      maxParticipants: 8,
      entityType: EntityType.GAME,
    }),
  'reject game roster 8',
);

try {
  assertMaxParticipantsWithinUserCap({
    jwtIsAdmin: false,
    actor,
    maxParticipants: 4,
    entityType: EntityType.GAME,
  });
} catch (e) {
  console.error('FAIL: game 4 should pass', e);
  process.exit(1);
}

assertThrows(
  () =>
    assertMaxParticipantsWithinUserCap({
      jwtIsAdmin: false,
      actor,
      maxParticipants: 16,
      entityType: EntityType.TOURNAMENT,
    }),
  'reject tournament 16 for normal user',
);

try {
  assertMaxParticipantsWithinUserCap({
    jwtIsAdmin: false,
    actor,
    maxParticipants: 12,
    entityType: EntityType.TOURNAMENT,
  });
} catch (e) {
  if (e instanceof ApiError) {
    console.error('FAIL: tournament 12 should pass', e.message);
    process.exit(1);
  }
  throw e;
}

console.log('ok: userMaxParticipantsCap');
