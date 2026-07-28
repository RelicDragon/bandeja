import assert from 'node:assert/strict';
import {
  hashMyTabVersionFingerprint,
  isInviteActiveForVersion,
  MyTabDataService,
  type MyTabDataOutput,
} from './myTabData.service';

function emptyMyTabData(overrides?: Partial<MyTabDataOutput>): MyTabDataOutput {
  return {
    games: [],
    invites: [],
    teams: [],
    memberships: [],
    unreadCounts: {},
    storiesCount: null,
    booktimeConnected: null,
    ...overrides,
  };
}

function testGenerateETagChangesWhenStoriesCountChanges(): void {
  const base = emptyMyTabData();
  const withStories = emptyMyTabData({ storiesCount: 3 });

  assert.notEqual(MyTabDataService.generateETag(base), MyTabDataService.generateETag(withStories));
}

function testGenerateETagChangesWhenBooktimeConnectedChanges(): void {
  const disconnected = emptyMyTabData({ booktimeConnected: false });
  const connected = emptyMyTabData({ booktimeConnected: true });

  assert.notEqual(
    MyTabDataService.generateETag(disconnected),
    MyTabDataService.generateETag(connected),
  );
}

function testGenerateETagChangesWhenMembershipsChange(): void {
  const base = emptyMyTabData();
  const withMembership = emptyMyTabData({
    memberships: [{ id: 'm1', teamId: 't1', status: 'PENDING', updatedAt: '2026-01-01' }],
  });

  assert.notEqual(
    MyTabDataService.generateETag(base),
    MyTabDataService.generateETag(withMembership),
  );
}

function testGenerateETagTreatsNullMembershipsDifferentlyFromEmpty(): void {
  const empty = emptyMyTabData({ memberships: [] });
  const failed = emptyMyTabData({ memberships: null });

  assert.notEqual(MyTabDataService.generateETag(empty), MyTabDataService.generateETag(failed));
}

function testGenerateETagIsStableWhenOptionalFieldsUnchanged(): void {
  const data = emptyMyTabData({ storiesCount: 2, booktimeConnected: true });
  assert.equal(MyTabDataService.generateETag(data), MyTabDataService.generateETag({ ...data }));
}

function testInviteActiveForVersion(): void {
  const now = Date.parse('2026-07-28T12:00:00.000Z');
  assert.equal(isInviteActiveForVersion(null, now), true);
  assert.equal(isInviteActiveForVersion(undefined, now), true);
  assert.equal(isInviteActiveForVersion(new Date('2026-07-28T13:00:00.000Z'), now), true);
  assert.equal(isInviteActiveForVersion(new Date('2026-07-28T11:00:00.000Z'), now), false);
  assert.equal(isInviteActiveForVersion(new Date(now), now), false);
}

function testInviteActiveFlipChangesFingerprint(): void {
  const invite = {
    id: 'i1',
    status: 'INVITED',
    joinedAt: '2026-07-28T10:00:00.000Z',
    inviteExpiresAt: '2026-07-28T12:00:00.000Z',
  };
  const before = hashMyTabVersionFingerprint({
    v: 2,
    invites: [{ ...invite, active: true }],
  });
  const after = hashMyTabVersionFingerprint({
    v: 2,
    invites: [{ ...invite, active: false }],
  });
  assert.notEqual(before, after);
}

function testRosterHashChangeChangesFingerprint(): void {
  const a = hashMyTabVersionFingerprint({
    v: 2,
    games: [{ id: 'g1', rosterHash: 'aaa' }],
  });
  const b = hashMyTabVersionFingerprint({
    v: 2,
    games: [{ id: 'g1', rosterHash: 'bbb' }],
  });
  assert.notEqual(a, b);
}

testGenerateETagChangesWhenStoriesCountChanges();
testGenerateETagChangesWhenBooktimeConnectedChanges();
testGenerateETagChangesWhenMembershipsChange();
testGenerateETagTreatsNullMembershipsDifferentlyFromEmpty();
testGenerateETagIsStableWhenOptionalFieldsUnchanged();
testInviteActiveForVersion();
testInviteActiveFlipChangesFingerprint();
testRosterHashChangeChangesFingerprint();

console.log('ok: myTabData.service.test.ts');
