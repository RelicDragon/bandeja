import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contextKey } from '@/services/chat/unreadSnapshot';
import type { ChatItem } from '@/utils/chatListSort';
import { selectContextUnreadForListItem, useUnreadStore } from '@/store/unreadStore';
import { emptyUnreadTotals } from '@/services/chat/unreadSnapshot';

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
