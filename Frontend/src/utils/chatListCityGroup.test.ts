import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { GroupChannel } from '@/api/chat';
import type { ChatItem } from '@/utils/chatListSort';
import { usersChatItemsIncludeCityGroup } from './chatListCityGroup';

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      user: { id: 'me', currentCity: { id: 'city-1' } },
    }),
  },
}));

vi.mock('@/services/chat/chatThreadIndex', () => ({
  loadThreadIndexItemForContext: vi.fn(),
}));

vi.mock('@/api/chat', () => ({
  chatApi: { getGroupChannelById: vi.fn() },
}));

vi.mock('@/utils/chatListHelpers', () => ({
  deduplicateChats: (chats: ChatItem[]) => chats,
  groupsToChatItems: vi.fn((groups: GroupChannel[]) =>
    groups.map((g) => ({
      type: 'group' as const,
      data: g,
      lastMessageDate: new Date('2026-06-08T10:00:00Z'),
      unreadCount: 0,
    }))
  ),
}));

vi.mock('@/utils/unreadCountsFromStore', () => ({
  resolveGroupUnreadCounts: vi.fn(async () => ({})),
}));

vi.mock('@/utils/chatListSort', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/chatListSort')>();
  return {
    ...actual,
    sortChatItems: (items: ChatItem[]) => actual.sortChatItems(items, 'users', 'me'),
  };
});

function gameItem(id: string): ChatItem {
  return {
    type: 'game',
    data: { id, name: id, updatedAt: '2026-06-09T12:00:00Z', status: 'ACTIVE' } as ChatItem extends { type: 'game' } ? ChatItem['data'] : never,
    lastMessageDate: new Date('2026-06-09T12:00:00Z'),
    unreadCount: 0,
  };
}

function cityGroupItem(cityId: string): ChatItem {
  return {
    type: 'group',
    data: { id: cityId, name: 'Novi Sad', updatedAt: '2026-06-08T10:00:00Z', isCityGroup: true } as GroupChannel,
    lastMessageDate: new Date('2026-06-08T10:00:00Z'),
    unreadCount: 0,
  };
}

describe('usersChatItemsIncludeCityGroup', () => {
  it('detects city group row by id and flag', () => {
    expect(usersChatItemsIncludeCityGroup([gameItem('g1')], 'city-1')).toBe(false);
    expect(usersChatItemsIncludeCityGroup([cityGroupItem('city-1')], 'city-1')).toBe(true);
  });
});

describe('ensureCityGroupInUsersChatItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prepends city group from Dexie when missing from list', async () => {
    const { loadThreadIndexItemForContext } = await import('@/services/chat/chatThreadIndex');
    vi.mocked(loadThreadIndexItemForContext).mockResolvedValue(cityGroupItem('city-1'));

    const { ensureCityGroupInUsersChatItems } = await import('./chatListCityGroup');
    const result = await ensureCityGroupInUsersChatItems([gameItem('g1')], 'me', {
      fetchIfMissing: false,
    });

    expect(result.some((c) => c.type === 'group' && c.data.id === 'city-1')).toBe(true);
    expect(result[0]?.type === 'group' && result[0].data.id).toBe('city-1');
  });

  it('fetches city group from API when missing from Dexie', async () => {
    const { loadThreadIndexItemForContext } = await import('@/services/chat/chatThreadIndex');
    const { chatApi } = await import('@/api/chat');
    vi.mocked(loadThreadIndexItemForContext).mockResolvedValue(null);
    vi.mocked(chatApi.getGroupChannelById).mockResolvedValue({
      data: {
        id: 'city-1',
        name: 'Novi Sad',
        updatedAt: '2026-06-08T10:00:00Z',
        isCityGroup: true,
      } as GroupChannel,
    });

    const { ensureCityGroupInUsersChatItems } = await import('./chatListCityGroup');
    const result = await ensureCityGroupInUsersChatItems([gameItem('g1')], 'me');

    expect(chatApi.getGroupChannelById).toHaveBeenCalledWith('city-1');
    expect(result[0]?.type === 'group' && result[0].data.id).toBe('city-1');
    expect((result[0]?.data as GroupChannel).isCityGroup).toBe(true);
  });

  it('replaces stale group row missing isCityGroup flag', async () => {
    const staleRow: ChatItem = {
      type: 'group',
      data: { id: 'city-1', name: 'Stale', updatedAt: '2026-06-01T00:00:00Z' } as GroupChannel,
      lastMessageDate: new Date('2026-06-01T00:00:00Z'),
      unreadCount: 0,
    };
    const { loadThreadIndexItemForContext } = await import('@/services/chat/chatThreadIndex');
    vi.mocked(loadThreadIndexItemForContext).mockResolvedValue(cityGroupItem('city-1'));

    const { ensureCityGroupInUsersChatItems } = await import('./chatListCityGroup');
    const result = await ensureCityGroupInUsersChatItems([gameItem('g1'), staleRow], 'me', {
      fetchIfMissing: false,
    });

    const cityRows = result.filter((c) => c.type === 'group' && c.data.id === 'city-1');
    expect(cityRows).toHaveLength(1);
    expect((cityRows[0]?.data as GroupChannel).isCityGroup).toBe(true);
  });
});
