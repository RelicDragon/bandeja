import assert from 'node:assert/strict';
import {
  acceptedMemberUserIds,
  classifyMembersForAddToGame,
  includeFullGameForPartner,
  isUserTeamReady,
  partnerOnGameStatus,
} from './userTeamReady';

assert.equal(
  isUserTeamReady({
    size: 2,
    members: [{ status: 'ACCEPTED' }, { status: 'PENDING' }],
  }),
  false,
);
assert.equal(
  isUserTeamReady({
    size: 2,
    members: [{ status: 'ACCEPTED' }, { status: 'ACCEPTED' }],
  }),
  true,
);

assert.deepEqual(
  acceptedMemberUserIds({
    members: [
      { status: 'ACCEPTED', userId: 'a' },
      { status: 'PENDING', userId: 'b' },
      { status: 'ACCEPTED', userId: 'c' },
    ],
  }),
  ['a', 'c'],
);

assert.deepEqual(
  classifyMembersForAddToGame(['owner', 'partner'], [
    { userId: 'owner', status: 'PLAYING' },
  ]),
  { toInvite: ['partner'], toTag: ['owner'], toPromoteFromQueue: [] },
);

assert.deepEqual(
  classifyMembersForAddToGame(['owner', 'partner'], [
    { userId: 'owner', status: 'PLAYING' },
    { userId: 'partner', status: 'INVITED' },
  ]),
  { toInvite: [], toTag: ['owner', 'partner'], toPromoteFromQueue: [] },
);

assert.deepEqual(
  classifyMembersForAddToGame(['owner', 'partner'], [
    { userId: 'owner', status: 'PLAYING' },
    { userId: 'partner', status: 'IN_QUEUE' },
  ]),
  { toInvite: [], toTag: ['owner'], toPromoteFromQueue: ['partner'] },
);

assert.equal(
  partnerOnGameStatus('p', [{ userId: 'p', status: 'IN_QUEUE' }]),
  'queued',
);
assert.equal(includeFullGameForPartner('none'), false);
assert.equal(includeFullGameForPartner('queued'), false);
assert.equal(includeFullGameForPartner('invited'), true);
assert.equal(includeFullGameForPartner('playing'), true);
assert.equal(includeFullGameForPartner('other'), true);

console.log('userTeamReady.test.ts ok');
