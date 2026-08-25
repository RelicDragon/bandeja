import assert from 'node:assert/strict';
import { rankInvitePoolMembers } from './playIntentInvitePoolRanking';

const ranked = rankInvitePoolMembers([
  { userId: 'miss-friend', matchesGame: false, matchScore: 20, gamesTogetherCount: 9 },
  { userId: 'fit-new', matchesGame: true, matchScore: 50, gamesTogetherCount: 0 },
  { userId: 'fit-friend', matchesGame: true, matchScore: 50, gamesTogetherCount: 4 },
  { userId: 'fit-tight', matchesGame: true, matchScore: 55, gamesTogetherCount: 0 },
  { userId: 'miss-new', matchesGame: false, matchScore: 30, gamesTogetherCount: 0 },
]);

assert.deepEqual(
  ranked.map((m) => m.userId),
  ['fit-tight', 'fit-friend', 'fit-new', 'miss-new', 'miss-friend'],
);

const deduped = rankInvitePoolMembers([
  { userId: 'same', matchesGame: false, matchScore: 10, gamesTogetherCount: 0 },
  { userId: 'same', matchesGame: true, matchScore: 40, gamesTogetherCount: 0 },
]);
assert.deepEqual(
  deduped.map((m) => [m.userId, m.matchesGame]),
  [['same', true]],
);

console.log('playIntentInvitePoolRanking.test.ts: ok');
