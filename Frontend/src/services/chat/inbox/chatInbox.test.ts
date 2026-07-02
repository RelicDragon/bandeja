import { describe, expect, it } from 'vitest';
import type { ChatItem } from '@/components/chat/chatListTypes';
import {
  buildUnreadByThread,
  deriveChatInboxReadModel,
  deriveDisplayedChats,
  mergeThreadUnreadCounts,
  sortThreadsForFilter,
} from './deriveChatInboxReadModel';
import { createFakeChatInboxAdapter } from './chatInboxFakeAdapter';

import type { GroupChannel, UserChat } from '@/api/chat';

function userThread(id: string, unread: number, updatedAt: string): ChatItem {
  return {
    type: 'user',
    data: {
      id,
      user1Id: 'me',
      user2Id: 'other',
      updatedAt,
      isPinned: false,
    } as UserChat,
    lastMessageDate: new Date(updatedAt),
    unreadCount: unread,
    otherUser: { id: 'other', firstName: 'A', lastName: 'B' },
  };
}

function marketChannel(id: string, unread: number, role: 'buyer' | 'seller'): ChatItem {
  return {
    type: 'channel',
    data: {
      id,
      buyerId: role === 'buyer' ? 'me' : 'other',
      marketItemId: `item-${id}`,
      marketItem: { sellerId: role === 'seller' ? 'me' : 'other' },
      updatedAt: '2026-01-01',
    } as GroupChannel,
    lastMessageDate: new Date('2026-01-01'),
    unreadCount: unread,
  };
}

describe('deriveDisplayedChats', () => {
  it('shows all unread market threads when unread filter overrides role filter', () => {
    const threads = [
      marketChannel('buyer-unread', 2, 'buyer'),
      marketChannel('seller-unread', 1, 'seller'),
      marketChannel('buyer-read', 0, 'buyer'),
    ];
    const displayed = deriveDisplayedChats({
      chatsFilter: 'market',
      threads,
      unreadFilterActive: true,
      marketChatRole: 'buyer',
      debouncedSearchQuery: '',
      userId: 'me',
      marketUnreadCounts: {},
    });
    expect(displayed).toHaveLength(2);
    expect(displayed.map((c) => (c.type === 'channel' ? c.data.id : ''))).toEqual(
      expect.arrayContaining(['buyer-unread', 'seller-unread'])
    );
  });

  it('filters unread threads from the full list for non-market tabs', () => {
    const threads = [userThread('read', 0, '2026-01-01'), userThread('unread', 3, '2026-01-02')];
    const displayed = deriveDisplayedChats({
      chatsFilter: 'users',
      threads,
      unreadFilterActive: true,
      marketChatRole: 'buyer',
      debouncedSearchQuery: '',
      userId: 'me',
      marketUnreadCounts: {},
    });
    expect(displayed).toHaveLength(1);
    expect(displayed[0]?.type === 'user' && displayed[0].data.id).toBe('unread');
  });
});

describe('deriveChatInboxReadModel', () => {
  it('builds unread map keyed by chat row key', () => {
    const threads = [userThread('a', 2, '2026-01-02'), userThread('b', 0, '2026-01-01')];
    const map = buildUnreadByThread(threads);
    expect(map.get('user-a')).toBe(2);
    expect(map.get('user-b')).toBe(0);
  });

  it('sorts threads by activity and merges unread overrides', () => {
    const threads = [userThread('old', 1, '2026-01-01'), userThread('new', 3, '2026-06-01')];
    const sorted = sortThreadsForFilter(threads, 'users', 'me');
    expect(sorted[0]?.type === 'user' && sorted[0].data.id).toBe('new');
    const merged = mergeThreadUnreadCounts(sorted, new Map([['user-new', 9]]));
    expect(merged.find((t) => t.type === 'user' && t.data.id === 'new')?.unreadCount).toBe(9);
  });

  it('derives subtab unread count from warm store badges', () => {
    const model = deriveChatInboxReadModel({
      threads: [],
      loading: false,
      refreshing: false,
      error: null,
      pagination: {
        bugsHasMore: false,
        bugsLoadingMore: false,
        usersHasMore: false,
        usersLoadingMore: false,
        channelsHasMore: false,
        channelsLoadingMore: false,
        marketHasMore: false,
        marketLoadingMore: false,
      },
      chatsFilter: 'users',
      unreadFilterActive: false,
      marketChatRole: 'buyer',
      debouncedSearchQuery: '',
      userId: 'me',
      subtabs: { users: 4, bugs: 0, channels: 0, market: 0 },
      unreadStoreWarm: true,
      marketUnreadCounts: {},
      marketBuyerSellerUnreadFromStore: { buyer: 0, seller: 0 },
    });
    expect(model.unreadChatsCount).toBe(4);
    expect(model.subtabs.users).toBe(4);
  });
});

describe('createFakeChatInboxAdapter', () => {
  it('updates threads on patchRowsForFilter', () => {
    const adapter = createFakeChatInboxAdapter({
      threads: [userThread('x', 1, '2026-01-01')],
    });
    const snap = adapter.getFeedSnapshot();
    expect(snap.threads).toHaveLength(1);
    adapter.patchRowsForFilter('users', (prev) =>
      prev.map((t) => (t.type === 'user' && t.data.id === 'x' ? { ...t, unreadCount: 5 } : t))
    );
    expect(adapter.getFeedSnapshot().threads[0]?.unreadCount).toBe(5);
  });

  it('stores thread index on replaceThreadIndex', () => {
    const adapter = createFakeChatInboxAdapter();
    const rows = [userThread('z', 2, '2026-01-03')];
    adapter.replaceThreadIndex('users', rows);
    adapter.commitFilterCache('users', { chats: rows }, { applyToVisible: true });
    expect(adapter.getFeedSnapshot().threads).toHaveLength(1);
    expect(adapter.getSubtabBadge('users')).toBe(0);
  });
});

describe('fake adapter socket unread path', () => {
  it('reflects unread patch in feed snapshot', () => {
    const adapter = createFakeChatInboxAdapter({
      subtabs: { users: 1, bugs: 0, channels: 0, market: 0 },
      threads: [userThread('u1', 1, '2026-01-04')],
    });
    adapter.patchRowsForFilter('users', (prev) =>
      prev.map((c) => (c.type === 'user' && c.data.id === 'u1' ? { ...c, unreadCount: 7 } : c))
    );
    const thread = adapter.getFeedSnapshot().threads[0];
    expect(thread?.unreadCount).toBe(7);
    const model = deriveChatInboxReadModel({
      threads: adapter.getFeedSnapshot().threads,
      loading: false,
      refreshing: false,
      error: null,
      pagination: adapter.getFeedSnapshot().pagination,
      chatsFilter: 'users',
      unreadFilterActive: false,
      marketChatRole: 'buyer',
      debouncedSearchQuery: '',
      userId: 'me',
      subtabs: { users: 7, bugs: 0, channels: 0, market: 0 },
      unreadStoreWarm: true,
      marketUnreadCounts: {},
      marketBuyerSellerUnreadFromStore: { buyer: 0, seller: 0 },
    });
    expect(model.unreadByThread.get('user-u1')).toBe(7);
  });
});
