import assert from 'node:assert/strict';
import { rankPlayIntentPoolMembers } from './playIntentPoolRanking';

{
  const oldCandidates = Array.from({ length: 80 }, (_, index) => ({
    userId: `old-${String(index).padStart(2, '0')}`,
    eligibleForProposal: false,
    affinityScore: 1,
  }));
  const laterBestCandidate = {
    userId: 'later-best',
    eligibleForProposal: true,
    affinityScore: 9,
  };
  const result = rankPlayIntentPoolMembers(
    [...oldCandidates, laterBestCandidate],
    48,
  );
  assert.equal(result.members[0]?.userId, laterBestCandidate.userId);
  assert.equal(result.total, 81);
  assert.equal(result.overflow, 33);
}

{
  const result = rankPlayIntentPoolMembers(
    [
      {
        userId: 'b',
        eligibleForProposal: false,
        affinityScore: 3,
      },
      {
        userId: 'a',
        eligibleForProposal: false,
        affinityScore: 3,
      },
    ],
    48,
  );
  assert.deepEqual(
    result.members.map((member) => member.userId),
    ['a', 'b'],
  );
}

console.log('playIntentPoolRanking.test.ts: ok');
