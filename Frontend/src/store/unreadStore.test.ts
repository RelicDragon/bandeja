import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contextKey } from '@/services/chat/unreadSnapshot';
import type { ChatItem } from '@/utils/chatListSort';
import { selectContextUnreadForListItem, selectContextUnread, useUnreadStore } from '@/store/unreadStore';
import { emptyUnreadTotals } from '@/services/chat/unreadSnapshot';

const viewingUserChatId = vi.hoisted(() => ({ current: null as string | null }));

vi.mock('@/components/GameDetails/gameDetailsChromeStore', () => ({
  useGameDetailsChromeStore: {
    getState: () => ({
      viewingGameChatId: null,
      viewingUserChatId: viewingUserChatId.current,
      viewingGroupChannelId: null,
    }),
  },
}));

const getUnreadSnapshotMock = vi.fn();

vi.mock('@/api/chat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/chat')>();
  return {
    ...actual,
    chatApi: {
      ...actual.chatApi,
      getUnreadSnapshot: (...args: unknown[]) => getUnreadSnapshotMock(...args),
    },
  };
});

describe('selectContextUnreadForListItem', () => {
  const gameItem = {
    type: 'game',
    data: { id: 'g1' },
    unreadCount: 5,
  } as ChatItem;

  it('returns 0 when warm and context key is absent (sparse map)', () => {
    const state = {
      fetchedAt: Date.now(),
      byContext: {},
      totals: emptyUnreadTotals(),
    } as Parameters<typeof selectContextUnreadForListItem>[1];
    expect(selectContextUnreadForListItem(gameItem, state, { warm: true })).toBe(0);
  });

  it('falls back to item.unreadCount when cold and key is absent', () => {
    const state = {
      fetchedAt: 0,
      byContext: {},
      totals: emptyUnreadTotals(),
    } as Parameters<typeof selectContextUnreadForListItem>[1];
    expect(selectContextUnreadForListItem(gameItem, state, { warm: false })).toBe(5);
  });

  it('prefers store count when key is present', () => {
    const state = {
      fetchedAt: Date.now(),
      byContext: { [contextKey('GAME', 'g1')]: 2 },
      totals: emptyUnreadTotals(),
    } as Parameters<typeof selectContextUnreadForListItem>[1];
    expect(selectContextUnreadForListItem(gameItem, state, { warm: true })).toBe(2);
  });

  it('keeps muted group row unread while excluding it from totals', () => {
    useUnreadStore.getState().reset();
    useUnreadStore.getState().setSnapshot({
      groupChannels: [
        {
          groupChannel: { id: 'muted-group', isChannel: false } as never,
          unreadCount: 9,
        },
      ],
      games: [],
      userChats: [],
      bugs: [],
      marketItems: [],
      byContext: { [contextKey('GROUP', 'muted-group')]: 9 },
      mutedGroupIds: ['muted-group'],
      totals: {
        all: 0,
        games: 0,
        userChats: 0,
        bugs: 0,
        groups: 0,
        channels: 0,
        marketplace: 0,
        myGames: 0,
        pastGames: 0,
      },
    });

    const groupItem = {
      type: 'group',
      data: { id: 'muted-group' },
      unreadCount: 0,
    } as ChatItem;
    const state = useUnreadStore.getState();
    expect(state.totals.all).toBe(0);
    expect(selectContextUnreadForListItem(groupItem, state, { warm: true })).toBe(9);
    useUnreadStore.getState().reset();
  });
});

describe('Phase 0 stale socket after optimistic clear (#236)', () => {
  const key = contextKey('USER', 'chat-stale');

  beforeEach(() => {
    useUnreadStore.getState().reset();
  });

  it('legacy payload without clock still applies (backward compat)', () => {
    useUnreadStore.setState({
      byContext: { [key]: 3 },
      totals: { ...emptyUnreadTotals(), all: 3, userChats: 3 },
      fetchedAt: Date.now(),
    });

    useUnreadStore.setState({
      byContext: {},
      totals: emptyUnreadTotals(),
      markInFlight: new Set([key]),
    });
    expect(useUnreadStore.getState().byContext[key]).toBeUndefined();

    useUnreadStore.getState().applySocketDelta({
      contextType: 'USER',
      contextId: 'chat-stale',
      unreadCount: 5,
    });

    expect(useUnreadStore.getState().byContext[key]).toBe(5);
    expect(selectContextUnread('USER', 'chat-stale')).toBe(5);
  });
});

describe('Phase 2 gated merge (#242)', () => {
  const key = contextKey('USER', 'chat-stale');

  beforeEach(() => {
    useUnreadStore.getState().reset();
  });

  it('stale socket after optimistic clear keeps display at 0', () => {
    useUnreadStore.setState({
      byContext: { [key]: 3 },
      contextRevisions: { [key]: 5 },
      maxSeenUserUnreadRevision: 10,
      totals: { ...emptyUnreadTotals(), all: 3, userChats: 3 },
      fetchedAt: Date.now(),
    });

    useUnreadStore.setState({
      byContext: {},
      totals: emptyUnreadTotals(),
    });

    useUnreadStore.getState().applySocketDelta({
      contextType: 'USER',
      contextId: 'chat-stale',
      unreadCount: 5,
      contextKey: key,
      clock: { userUnreadRevision: 9, userContextUnreadRevision: 4 },
    });

    expect(useUnreadStore.getState().byContext[key] ?? 0).toBe(0);
    expect(selectContextUnread('USER', 'chat-stale')).toBe(0);
  });

  it('accepts newer context revision and updates base count', () => {
    useUnreadStore.getState().applySocketDelta({
      contextType: 'USER',
      contextId: 'chat-stale',
      unreadCount: 2,
      contextKey: key,
      clock: { userUnreadRevision: 3, userContextUnreadRevision: 1 },
    });

    useUnreadStore.getState().applySocketDelta({
      contextType: 'USER',
      contextId: 'chat-stale',
      unreadCount: 4,
      contextKey: key,
      clock: { userUnreadRevision: 4, userContextUnreadRevision: 2 },
    });

    expect(useUnreadStore.getState().byContext[key]).toBe(4);
    expect(useUnreadStore.getState().contextRevisions[key]).toBe(2);
  });

  it('ignores stale snapshot below maxSeenUserUnreadRevision', () => {
    useUnreadStore.setState({
      lastAppliedSnapshotRevision: 8,
      maxSeenUserUnreadRevision: 11,
      byContext: { [key]: 2 },
      contextRevisions: { [key]: 3 },
      fetchedAt: Date.now(),
    });

    useUnreadStore.getState().setSnapshot({
      games: [],
      userChats: [],
      groupChannels: [],
      bugs: [],
      marketItems: [],
      byContext: { [key]: 9 },
      clock: { userUnreadRevision: 10 },
      contextRevisions: { [key]: 1 },
    });

    expect(useUnreadStore.getState().byContext[key]).toBe(2);
    expect(useUnreadStore.getState().lastAppliedSnapshotRevision).toBe(8);
  });

  it('applies snapshot at repairFloor when maxSeen advanced via delta', () => {
    useUnreadStore.setState({
      lastAppliedSnapshotRevision: 10,
      maxSeenUserUnreadRevision: 11,
      byContext: { [key]: 2 },
      contextRevisions: { [key]: 2 },
      fetchedAt: Date.now(),
    });

    useUnreadStore.getState().setSnapshot({
      games: [],
      userChats: [],
      groupChannels: [],
      bugs: [],
      marketItems: [],
      byContext: { [key]: 7, [contextKey('GAME', 'g1')]: 1 },
      clock: { userUnreadRevision: 11 },
      contextRevisions: { [key]: 3, [contextKey('GAME', 'g1')]: 1 },
    });

    expect(useUnreadStore.getState().lastAppliedSnapshotRevision).toBe(11);
    expect(useUnreadStore.getState().byContext[key]).toBe(7);
    expect(useUnreadStore.getState().byContext[contextKey('GAME', 'g1')]).toBe(1);
  });

  it('reapplies optimistic clear after accepted snapshot', () => {
    const inFlightKey = contextKey('USER', 'in-flight');
    useUnreadStore.setState({
      markInFlight: new Set([inFlightKey]),
      fetchedAt: Date.now(),
    });

    useUnreadStore.getState().setSnapshot({
      games: [],
      userChats: [],
      groupChannels: [],
      bugs: [],
      marketItems: [],
      byContext: { [inFlightKey]: 4 },
      clock: { userUnreadRevision: 2 },
    });

    expect(useUnreadStore.getState().byContext[inFlightKey]).toBeUndefined();
  });

  it('updates base while viewing but display stays 0', () => {
    const chatId = 'viewing-chat';
    const chatKey = contextKey('USER', chatId);
    viewingUserChatId.current = chatId;

    useUnreadStore.getState().applySocketDelta({
      contextType: 'USER',
      contextId: chatId,
      unreadCount: 3,
      contextKey: chatKey,
      clock: { userUnreadRevision: 2, userContextUnreadRevision: 1 },
    });

    expect(useUnreadStore.getState().byContext[chatKey]).toBe(3);
    expect(selectContextUnread('USER', chatId)).toBe(0);
    expect(useUnreadStore.getState().totals.userChats).toBe(0);

    viewingUserChatId.current = null;
  });
});

describe('authority envelope revision passthrough (#238)', () => {
  const key = contextKey('USER', 'chat-auth');

  beforeEach(() => {
    useUnreadStore.getState().reset();
  });

  it('stores contextRevisions and maxSeenUserUnreadRevision from envelope clock', () => {
    useUnreadStore.getState().applySocketDelta({
      contextType: 'USER',
      contextId: 'chat-auth',
      unreadCount: 0,
      contextKey: key,
      clock: { userUnreadRevision: 4, userContextUnreadRevision: 2 },
    });

    const state = useUnreadStore.getState();
    expect(state.contextRevisions[key]).toBe(2);
    expect(state.maxSeenUserUnreadRevision).toBe(4);
  });
});

describe('refreshAll in-flight dedupe (Phase 0 #233)', () => {
  beforeEach(() => {
    useUnreadStore.getState().reset();
    getUnreadSnapshotMock.mockReset();
    getUnreadSnapshotMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                data: {
                  games: [],
                  userChats: [],
                  groupChannels: [],
                  bugs: [],
                  marketItems: [],
                  byContext: {},
                  totals: emptyUnreadTotals(),
                },
              }),
            20
          );
        })
    );
  });

  it('coalesces concurrent refreshAll into one snapshot fetch', async () => {
    let resolveSnapshot: ((value: unknown) => void) | undefined;
    getUnreadSnapshotMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSnapshot = resolve;
        })
    );

    const first = useUnreadStore.getState().refreshAll();
    const second = useUnreadStore.getState().refreshAll();

    expect(getUnreadSnapshotMock).toHaveBeenCalledTimes(1);

    resolveSnapshot?.({
      data: {
        games: [],
        userChats: [],
        groupChannels: [],
        bugs: [],
        marketItems: [],
        byContext: {},
        totals: emptyUnreadTotals(),
      },
    });

    await Promise.all([first, second]);
  });
});

describe('chat:unread-invalidate handler (#241)', () => {
  beforeEach(() => {
    useUnreadStore.getState().reset();
    getUnreadSnapshotMock.mockReset();
    getUnreadSnapshotMock.mockResolvedValue({
      data: {
        games: [],
        userChats: [],
        groupChannels: [],
        bugs: [],
        marketItems: [],
        byContext: {},
        totals: emptyUnreadTotals(),
        clock: { userUnreadRevision: 5 },
      },
    });
  });

  it('ignores stale invalidation at or below lastAppliedSnapshotRevision', () => {
    useUnreadStore.setState({ lastAppliedSnapshotRevision: 7, maxSeenUserUnreadRevision: 7 });
    useUnreadStore.getState().onUserInvalidated({ userUnreadRevision: 7, reason: 'auto_read' });
    expect(getUnreadSnapshotMock).not.toHaveBeenCalled();
  });

  it('fetches deduped snapshot when invalidation revision is newer', async () => {
    useUnreadStore.setState({ lastAppliedSnapshotRevision: 2, maxSeenUserUnreadRevision: 2 });
    useUnreadStore.getState().onUserInvalidated({ userUnreadRevision: 5, reason: 'auto_read' });
    await useUnreadStore.getState().refreshInFlight;
    expect(getUnreadSnapshotMock).toHaveBeenCalledTimes(1);
    expect(useUnreadStore.getState().maxSeenUserUnreadRevision).toBe(5);
    expect(useUnreadStore.getState().lastAppliedSnapshotRevision).toBe(5);
  });

  it('coalesces concurrent invalidation-triggered refreshAll calls', async () => {
    const first = useUnreadStore.getState().refreshAll();
    const second = useUnreadStore.getState().refreshAll();
    await Promise.all([first, second]);
    expect(getUnreadSnapshotMock).toHaveBeenCalledTimes(1);
  });
});
