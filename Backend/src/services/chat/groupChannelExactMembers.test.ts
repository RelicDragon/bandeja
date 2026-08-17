import assert from 'node:assert/strict';
import {
  discussionGroupCandidateWhere,
  participantIdsMatch,
} from './groupChannelExactMembers.where';

{
  const where = discussionGroupCandidateWhere('owner', 3);
  assert.equal(where.isChannel, false);
  assert.equal(where.isCityGroup, false);
  assert.equal(where.isPublic, false);
  assert.equal(where.bugId, null);
  assert.equal(where.marketItemId, null);
  assert.equal(where.participantsCount, 3);
  assert.deepEqual(where.participants, { some: { userId: 'owner' } });
}

assert.equal(participantIdsMatch(['c', 'a', 'b'], ['b', 'c', 'a']), true);
assert.equal(participantIdsMatch(['a', 'b', 'c'], ['a', 'b', 'c', 'd']), false);
assert.equal(participantIdsMatch(['a', 'b', 'c'], ['a', 'b']), false);

console.log('groupChannelExactMembers.test.ts: ok');
