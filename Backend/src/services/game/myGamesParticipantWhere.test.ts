import assert from 'node:assert/strict';
import { myGamesMembershipWhere } from './myGamesParticipantWhere';

const where = myGamesMembershipWhere('user-1');
assert.equal(where.OR?.length, 2);
assert.deepEqual(where.OR?.[0], {
  entityType: { not: 'EVENT' },
  participants: {
    some: {
      userId: 'user-1',
      status: { not: 'INVITED' },
    },
  },
});
assert.deepEqual(where.OR?.[1], {
  entityType: 'EVENT',
  participants: {
    some: {
      userId: 'user-1',
      status: { not: 'INVITED' },
      OR: [{ role: 'OWNER' }, { status: 'PLAYING' }, { lookingForPartner: true }],
    },
  },
});

console.log('ok: myGamesParticipantWhere.test.ts');
