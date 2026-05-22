import { describe, expect, it } from 'vitest';
import {
  byContextFromSnapshotDto,
  computeTotals,
  contextKey,
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
  });
});

describe('normalizeSocketContextToKey', () => {
  it('maps BUG id to GROUP channel when meta has bugId', () => {
    const key = normalizeSocketContextToKey('BUG', 'b1', {
      'ch-1': { bugId: 'b1', isChannel: true },
    });
    expect(key).toBe(contextKey('GROUP', 'ch-1'));
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
});
