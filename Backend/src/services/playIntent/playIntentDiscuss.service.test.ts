import assert from 'node:assert/strict';
import {
  normalizeDiscussUserIds,
  pickDiscussProposal,
  selectDiscussProposal,
} from './normalizeDiscussUserIds';

assert.deepEqual(normalizeDiscussUserIds('viewer', ['two', 'viewer', 'three', 'two']), [
  'two',
  'three',
]);
assert.deepEqual(normalizeDiscussUserIds('viewer', ['viewer']), []);

{
  const proposal = {
    id: 'p1',
    members: [{ userId: 'viewer' }, { userId: 'two' }, { userId: 'three' }],
  };
  assert.equal(selectDiscussProposal(proposal, ['two', 'three'])?.id, 'p1');
  assert.equal(selectDiscussProposal(proposal, ['two', 'four']), null);
  assert.equal(selectDiscussProposal(null, ['two', 'three']), null);
}

{
  const older = {
    id: 'older',
    members: [{ userId: 'viewer' }, { userId: 'two' }, { userId: 'three' }],
  };
  const latest = {
    id: 'latest',
    members: [{ userId: 'viewer' }, { userId: 'four' }, { userId: 'five' }],
  };
  assert.equal(pickDiscussProposal([latest, older], ['two', 'three'])?.id, 'older');
  assert.equal(pickDiscussProposal([latest], ['two', 'three']), null);
}

console.log('playIntentDiscuss.service.test.ts: ok');
