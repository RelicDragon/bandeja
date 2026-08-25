import assert from 'node:assert/strict';
import { myGamesParticipantWhere } from './myGamesParticipantWhere';

const where = myGamesParticipantWhere('user-1');
assert.equal(where.some.userId, 'user-1');
assert.equal(where.some.status.not, 'INVITED');

console.log('ok: myGamesParticipantWhere.test.ts');
