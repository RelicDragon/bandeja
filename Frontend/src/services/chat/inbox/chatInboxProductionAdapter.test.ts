import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contextKey } from '@/services/chat/unreadSnapshot';

const displayedByContext: Record<string, number> = {};
const baseByContext: Record<string, number> = {};

vi.mock('@/services/chat/chatThreadIndex', () => ({
  loadThreadIndexForList: vi.fn(),
  persistThreadIndexReplace: vi.fn(),
  persistThreadIndexUpsert: vi.fn(),
  patchThreadIndexClearUnread: vi.fn(),
  patchThreadIndexFromMessage: vi.fn(),
}));

vi.mock('@/store/unreadStore', () => ({
  selectChatsSubtabBadge: () => 0,
  isUnreadStoreWarm: () => true,
  useUnreadStore: {
    getState: () => ({
      displayedByContext,
      byContext: baseByContext,
    }),
  },
}));

vi.mock('@/components/chat/chatListFeedStore', () => ({
  useChatListFeedStore: {
    getState: () => ({
      rows: [],
      loading: false,
      pagination: {
        bugs: { hasMore: false, loadingMore: false },
        users: { hasMore: false, loadingMore: false },
        channels: { hasMore: false, loadingMore: false },
        market: { hasMore: false, loadingMore: false },
      },
      filterCache: {},
    }),
  },
}));

vi.mock('@/store/chatSyncStore', () => ({
  useChatSyncStore: { getState: () => ({ lastSyncCompletedAt: 0 }) },
}));

vi.mock('@/store/socketEventsStore', () => ({
  useSocketEventsStore: {
    getState: () => ({
      listChatMessageSeq: 0,
      listChatUnreadSeq: 0,
      lastNewBug: null,
      lastChatUnreadCount: null,
    }),
  },
}));

vi.mock('@/store/shellNavStore', () => ({
  useShellNavStore: { getState: () => ({ chatsFilter: 'users' }) },
}));

vi.mock('@/store/playersStore', () => ({
  usePlayersStore: { getState: () => ({ invalidateUserChatsCache: vi.fn() }) },
}));

import { createProductionChatInboxAdapter } from './chatInboxProductionAdapter';

describe('createProductionChatInboxAdapter', () => {
  beforeEach(() => {
    Object.keys(displayedByContext).forEach((k) => delete displayedByContext[k]);
    Object.keys(baseByContext).forEach((k) => delete baseByContext[k]);
  });

  it('getMarketUnreadCounts uses displayedByContext (optimistic mark-read)', () => {
    const channelId = 'market-ch-1';
    baseByContext[contextKey('GROUP', channelId)] = 3;
    displayedByContext[contextKey('GROUP', channelId)] = 0;

    const adapter = createProductionChatInboxAdapter();
    expect(adapter.getMarketUnreadCounts([channelId])).toEqual({});
  });

  it('getMarketUnreadCounts reflects displayed unread when present', () => {
    const channelId = 'market-ch-2';
    displayedByContext[contextKey('GROUP', channelId)] = 2;

    const adapter = createProductionChatInboxAdapter();
    expect(adapter.getMarketUnreadCounts([channelId])).toEqual({ [channelId]: 2 });
  });
});
