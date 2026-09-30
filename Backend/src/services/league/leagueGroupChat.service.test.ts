import assert from 'node:assert/strict';
import { ParticipantRole } from '@prisma/client';
import { buildLeagueGroupChatMembers, leagueGroupChatName } from './leagueGroupChat.service';

const members = buildLeagueGroupChatMembers({
  groupId: 'g1',
  participants: [
    { userId: null, leagueTeam: { players: [{ userId: 'a' }, { userId: 'b' }] } },
    { userId: 'solo', leagueTeam: null },
    { userId: null, leagueTeam: { players: [{ userId: 'owner' }, { userId: 'c' }] } },
  ],
  seasonAdmins: [
    { userId: 'owner', role: ParticipantRole.OWNER },
    { userId: 'admin', role: ParticipantRole.ADMIN },
  ],
});

assert.deepEqual(Object.fromEntries(members), {
  a: 'PARTICIPANT',
  b: 'PARTICIPANT',
  solo: 'PARTICIPANT',
  owner: 'OWNER',
  c: 'PARTICIPANT',
  admin: 'ADMIN',
});

const adminsOnly = buildLeagueGroupChatMembers({
  groupId: 'g2',
  participants: [],
  seasonAdmins: [{ userId: 'admin', role: ParticipantRole.ADMIN }],
});
assert.deepEqual(Object.fromEntries(adminsOnly), { admin: 'ADMIN' });

assert.equal(leagueGroupChatName('Jesen-Zima 2026', 'Group A'), 'Jesen-Zima 2026 · Group A');
assert.equal(leagueGroupChatName(null, 'Group A'), 'Group A');
assert.equal(leagueGroupChatName('  ', 'Group A'), 'Group A');

console.log('leagueGroupChat.service.test.ts: ok');
