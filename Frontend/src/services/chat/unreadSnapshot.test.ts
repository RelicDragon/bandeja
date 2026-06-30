import { describe, expect, it } from 'vitest';
import {
  applyScopedGameTotals,
  byContextFromSnapshotDto,
  computeScopedGameTotals,
  computeTotals,
  contextKey,
  mergeServerTotals,
  normalizeSocketContextToKey,
  selectBottomTabChatsBadgeFromTotals,
  selectChatsSubtabBadgeFromTotals,
} from './unreadSnapshot';

describe('computeTotals', () => {
  it('classifies GROUP into bugs, channels, marketplace, groups', () => {
    const byContext = {
      [contextKey('GAME', 'g1')]: 2,
      [contextKey('USER', 'u1')]: 1,
      [contextKey('GROUP', 'bug-ch')]: 3,
      [contextKey('GROUP', 'social-ch')]: 4,
      [contextKey('GROUP', 'channel-ch')]: 5,
      [contextKey('GROUP', 'market-ch')]: 6,
    };
    const totals = computeTotals(byContext, {
      groupChannelMeta: {
        'bug-ch': { bugId: 'b1', isChannel: true },
        'social-ch': { isChannel: false },
        'channel-ch': { isChannel: true, marketItemId: null },
        'market-ch': { marketItemId: 'm1', isChannel: true },
      },
      mutedGroupIds: new Set(),
    });
    expect(totals.games).toBe(2);
    expect(totals.userChats).toBe(1);
    expect(totals.bugs).toBe(3);
    expect(totals.groups).toBe(4);
    expect(totals.channels).toBe(5);
    expect(totals.marketplace).toBe(6);
    expect(totals.all).toBe(21);
  });

  it('excludes muted GROUP from totals', () => {
    const byContext = { [contextKey('GROUP', 'muted')]: 9 };
    const totals = computeTotals(byContext, {
      groupChannelMeta: { muted: { isChannel: false } },
      mutedGroupIds: new Set(['muted']),
    });
    expect(totals.all).toBe(0);
    expect(totals.groups).toBe(0);
  });

  it('keeps muted GROUP count in byContext but out of totals', () => {
    const byContext = { [contextKey('GROUP', 'muted')]: 9 };
    expect(byContext[contextKey('GROUP', 'muted')]).toBe(9);
    expect(
      computeTotals(byContext, {
        groupChannelMeta: { muted: { isChannel: false } },
        mutedGroupIds: new Set(['muted']),
      }).all
    ).toBe(0);
  });
});

describe('normalizeSocketContextToKey', () => {
  it('maps BUG id to GROUP channel when meta has bugId', () => {
    const key = normalizeSocketContextToKey('BUG', 'b1', {
      'ch-1': { bugId: 'b1', isChannel: true },
    });
    expect(key).toBe(contextKey('GROUP', 'ch-1'));
  });

  it('maps BUG id via bugIdToChannelId map when meta is empty', () => {
    const key = normalizeSocketContextToKey('BUG', 'b1', {}, { b1: 'ch-2' });
    expect(key).toBe(contextKey('GROUP', 'ch-2'));
  });
});

describe('mergeServerTotals', () => {
  it('keeps client-scoped myGames when server snapshot sends 0 placeholder', () => {
    const byContext = { [contextKey('GAME', 'mine')]: 4 };
    const meta = {
      groupChannelMeta: {},
      mutedGroupIds: new Set<string>(),
      myGameIds: new Set(['mine']),
      pastGameIds: new Set<string>(),
    };
    const computed = applyScopedGameTotals(computeTotals(byContext, meta), byContext, meta);
    expect(computed.myGames).toBe(4);
    const merged = mergeServerTotals(computed, { myGames: 0, pastGames: 0 });
    expect(merged.myGames).toBe(4);
    expect(merged.pastGames).toBe(0);
  });

  it('prefers positive server myGames overlay when provided', () => {
    const computed = applyScopedGameTotals(
      computeTotals({}, { groupChannelMeta: {}, mutedGroupIds: new Set() }),
      {},
      { groupChannelMeta: {}, mutedGroupIds: new Set(), myGameIds: new Set(['g1']) }
    );
    const merged = mergeServerTotals(computed, { myGames: 7 });
    expect(merged.myGames).toBe(7);
  });
});

describe('computeScopedGameTotals', () => {
  it('sums unread only for scoped game ids', () => {
    const byContext = {
      [contextKey('GAME', 'mine')]: 2,
      [contextKey('GAME', 'past')]: 3,
      [contextKey('GAME', 'other')]: 9,
    };
    const scoped = computeScopedGameTotals(
      byContext,
      new Set(['mine']),
      new Set(['past'])
    );
    expect(scoped.myGames).toBe(2);
    expect(scoped.pastGames).toBe(3);
  });
});

describe('chat tab badges', () => {
  const t = {
    all: 21,
    games: 2,
    userChats: 1,
    bugs: 3,
    groups: 4,
    channels: 5,
    marketplace: 6,
    myGames: 0,
    pastGames: 0,
  };

  it('users subtab includes games shown in the users chat list', () => {
    expect(selectChatsSubtabBadgeFromTotals('users', t)).toBe(7);
  });

  it('bottom Chats tab equals sum of subtabs', () => {
    const subtabSum =
      selectChatsSubtabBadgeFromTotals('users', t) +
      selectChatsSubtabBadgeFromTotals('market', t) +
      selectChatsSubtabBadgeFromTotals('channels', t) +
      selectChatsSubtabBadgeFromTotals('bugs', t);
    expect(selectBottomTabChatsBadgeFromTotals(t)).toBe(subtabSum);
    expect(subtabSum).toBe(21);
  });
});

describe('byContextFromSnapshotDto', () => {
  it('builds GAME and GROUP keys from arrays', () => {
    const map = byContextFromSnapshotDto({
      games: [{ game: { id: 'g1' } as import('@/types').Game, unreadCount: 2 }],
      userChats: [],
      bugs: [],
      groupChannels: [],
      marketItems: [{ groupChannelId: 'mc', marketItem: { id: 'm1' }, unreadCount: 1 }],
    });
    expect(map[contextKey('GAME', 'g1')]).toBe(2);
    expect(map[contextKey('GROUP', 'mc')]).toBe(1);
  });

  it('prefers dto.byContext when present', () => {
    const map = byContextFromSnapshotDto({
      byContext: { [contextKey('USER', 'u1')]: 3 },
      games: [],
      userChats: [],
      bugs: [],
      groupChannels: [],
      marketItems: [],
    });
    expect(map[contextKey('USER', 'u1')]).toBe(3);
  });
});
