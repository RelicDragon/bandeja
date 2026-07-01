import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const {
  computeTotals,
  contextKey,
  mergeDeltaAccepted,
  mergeSnapshotAccepted,
  shouldApplyDelta,
  shouldApplySnapshot,
} = require('../dist/index.js');

const meta = {
  groupChannelMeta: {
    'bug-ch': { bugId: 'b1', isChannel: true },
    'social-ch': { isChannel: false },
    'channel-ch': { isChannel: true, marketItemId: null },
    'market-ch': { marketItemId: 'm1', isChannel: true },
  },
  mutedGroupIds: new Set(),
};

test('computeTotals classifies GROUP buckets', () => {
  const byContext = {
    [contextKey('GAME', 'g1')]: 2,
    [contextKey('USER', 'u1')]: 1,
    [contextKey('GROUP', 'bug-ch')]: 3,
    [contextKey('GROUP', 'social-ch')]: 4,
    [contextKey('GROUP', 'channel-ch')]: 5,
    [contextKey('GROUP', 'market-ch')]: 6,
  };
  const totals = computeTotals(byContext, meta);
  assert.equal(totals.games, 2);
  assert.equal(totals.userChats, 1);
  assert.equal(totals.bugs, 3);
  assert.equal(totals.groups, 4);
  assert.equal(totals.channels, 5);
  assert.equal(totals.marketplace, 6);
  assert.equal(totals.all, 21);
});

test('computeTotals excludes muted groups from totals', () => {
  const byContext = { [contextKey('GROUP', 'muted')]: 9 };
  const totals = computeTotals(byContext, {
    groupChannelMeta: { muted: { isChannel: false } },
    mutedGroupIds: new Set(['muted']),
  });
  assert.equal(totals.all, 0);
});

test('shouldApplySnapshot repairFloor accepts equal-revision repair', () => {
  assert.equal(shouldApplySnapshot(11, 10, 11), true);
});

test('shouldApplySnapshot rejects stale snapshot below maxSeen', () => {
  assert.equal(shouldApplySnapshot(10, 10, 11), false);
});

test('shouldApplySnapshot targeted repair when request started before delta', () => {
  assert.equal(
    shouldApplySnapshot(10, 8, 11, {
      repairRequestedAtMaxSeen: 10,
      interveningDeltaUserRevision: null,
    }),
    true
  );
});

test('shouldApplySnapshot rejects targeted repair when newer delta arrived', () => {
  assert.equal(
    shouldApplySnapshot(10, 8, 11, {
      repairRequestedAtMaxSeen: 10,
      interveningDeltaUserRevision: 11,
    }),
    false
  );
});

test('shouldApplyDelta ignores stale or duplicate context revision', () => {
  assert.equal(shouldApplyDelta(2, 2), false);
  assert.equal(shouldApplyDelta(2, 3), false);
  assert.equal(shouldApplyDelta(3, 2), true);
});

test('mergeDeltaAccepted advances maxSeenUserUnreadRevision only', () => {
  const key = contextKey('USER', 'u1');
  const next = mergeDeltaAccepted(
    {
      lastAppliedSnapshotRevision: 5,
      maxSeenUserUnreadRevision: 5,
      baseByContext: {},
      contextRevisions: {},
    },
    key,
    2,
    { userUnreadRevision: 6, userContextUnreadRevision: 1 }
  );
  assert.equal(next.lastAppliedSnapshotRevision, 5);
  assert.equal(next.maxSeenUserUnreadRevision, 6);
  assert.equal(next.baseByContext[key], 2);
  assert.equal(next.contextRevisions[key], 1);
});

test('mergeSnapshotAccepted reapplies optimistic clears', () => {
  const key = contextKey('USER', 'u1');
  const next = mergeSnapshotAccepted(
    {
      lastAppliedSnapshotRevision: 2,
      maxSeenUserUnreadRevision: 4,
      baseByContext: {},
      contextRevisions: {},
    },
    {
      userUnreadRevision: 5,
      byContext: { [key]: 3 },
      contextRevisions: { [key]: 2 },
    },
    new Set([key])
  );
  assert.equal(next.lastAppliedSnapshotRevision, 5);
  assert.equal(next.maxSeenUserUnreadRevision, 5);
  assert.equal(next.baseByContext[key], undefined);
  assert.equal(next.contextRevisions[key], 2);
});
