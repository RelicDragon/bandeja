import { describe, expect, it } from 'vitest';
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

describe('MyTabDataService.generateETag', () => {
  it('changes when storiesCount changes', () => {
    const base = emptyMyTabData();
    const withStories = emptyMyTabData({ storiesCount: 3 });

    expect(MyTabDataService.generateETag(base)).not.toBe(MyTabDataService.generateETag(withStories));
  });

  it('changes when booktimeConnected changes', () => {
    const disconnected = emptyMyTabData({ booktimeConnected: false });
    const connected = emptyMyTabData({ booktimeConnected: true });

    expect(MyTabDataService.generateETag(disconnected)).not.toBe(
      MyTabDataService.generateETag(connected),
    );
  });

  it('changes when memberships change', () => {
    const base = emptyMyTabData();
    const withMembership = emptyMyTabData({
      memberships: [{ id: 'm1', teamId: 't1', status: 'PENDING', updatedAt: '2026-01-01' }],
    });

    expect(MyTabDataService.generateETag(base)).not.toBe(
      MyTabDataService.generateETag(withMembership),
    );
  });

  it('treats null memberships differently from empty memberships in etag', () => {
    const empty = emptyMyTabData({ memberships: [] });
    const failed = emptyMyTabData({ memberships: null });

    expect(MyTabDataService.generateETag(empty)).not.toBe(MyTabDataService.generateETag(failed));
  });

  it('is stable when optional fields are unchanged', () => {
    const data = emptyMyTabData({ storiesCount: 2, booktimeConnected: true });
    expect(MyTabDataService.generateETag(data)).toBe(MyTabDataService.generateETag({ ...data }));
  });
});
