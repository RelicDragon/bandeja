import assert from 'node:assert/strict';
import { MyTabDataService, type MyTabDataOutput } from './myTabData.service';

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

testGenerateETagChangesWhenStoriesCountChanges();
testGenerateETagChangesWhenBooktimeConnectedChanges();
testGenerateETagChangesWhenMembershipsChange();
testGenerateETagTreatsNullMembershipsDifferentlyFromEmpty();
testGenerateETagIsStableWhenOptionalFieldsUnchanged();

console.log('ok: myTabData.service.test.ts');
