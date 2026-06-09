import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { GroupChannel } from '@/api/chat';
import type { Game } from '@/types';
import type { ChatItem } from '@/components/chat/chatListTypes';
import {
  chatListOrderSig,
  chatListVisibleApplySig,
  prepareChatsForVisibleApply,
  prepareUsersTabDexFirstPaint,
  shouldSkipRedundantNetworkVisibleApply,
} from './chatInboxFeedPrepare';

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      user: { id: 'me', currentCity: { id: 'city-1' } },
    }),
  },
}));

vi.mock('@/utils/networkStatus', () => ({
  useNetworkStore: { getState: () => ({ isOnline: true }) },
}));

vi.mock('@/services/chat/chatThreadIndex', () => ({
  loadThreadIndexItemForContext: vi.fn(),
}));

vi.mock('@/api/chat', () => ({
  chatApi: { getGroupChannelById: vi.fn() },
}));

vi.mock('@/utils/unreadCountsFromStore', () => ({
  resolveGroupUnreadCounts: vi.fn(async () => ({})),
}));

function gameItem(id: string, unread = 0): ChatItem {
  return {
    type: 'game',
    data: { id, name: id, updatedAt: '2026-06-09T12:00:00Z', status: 'ACTIVE' } as Game,
    lastMessageDate: new Date('2026-06-09T12:00:00Z'),
    unreadCount: unread,
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

describe('chatListOrderSig', () => {
  it('tracks row order by chat key', () => {
    const a = [cityGroupItem('city-1'), gameItem('g1')];
    const b = [gameItem('g1'), cityGroupItem('city-1')];
    expect(chatListOrderSig(a)).not.toBe(chatListOrderSig(b));
    expect(chatListOrderSig(a)).toBe(chatListOrderSig([...a]));
  });
});

describe('shouldSkipRedundantNetworkVisibleApply', () => {
  it('skips when users tab content and city group match', () => {
    const list = [cityGroupItem('city-1'), gameItem('g1')];
    expect(shouldSkipRedundantNetworkVisibleApply(list, [...list], 'users')).toBe(true);
  });

  it('does not skip when city group missing from visible', () => {
    const visible = [gameItem('g1')];
    const incoming = [cityGroupItem('city-1'), gameItem('g1')];
    expect(shouldSkipRedundantNetworkVisibleApply(visible, incoming, 'users')).toBe(false);
  });

  it('does not skip when unread counts differ', () => {
    const visible = [cityGroupItem('city-1'), gameItem('g1', 0)];
    const incoming = [cityGroupItem('city-1'), gameItem('g1', 3)];
    expect(shouldSkipRedundantNetworkVisibleApply(visible, incoming, 'users')).toBe(false);
  });

  it('does not skip for non-users filters', () => {
    const list = [cityGroupItem('city-1')];
    expect(shouldSkipRedundantNetworkVisibleApply(list, list, 'bugs')).toBe(false);
  });
});

describe('prepareChatsForVisibleApply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes city group on games-only input (Dex inject path)', async () => {
    const { loadThreadIndexItemForContext } = await import('@/services/chat/chatThreadIndex');
    vi.mocked(loadThreadIndexItemForContext).mockResolvedValue(cityGroupItem('city-1'));

    const result = await prepareChatsForVisibleApply([gameItem('g1')], 'users', 'me', [], true);

    expect(result[0]?.type === 'group' && result[0].data.id).toBe('city-1');
    expect(result.some((c) => c.type === 'game' && c.data.id === 'g1')).toBe(true);
  });
});

describe('prepareUsersTabDexFirstPaint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('games-only Dex partitions paint with city group before network settle', async () => {
    const { loadThreadIndexItemForContext } = await import('@/services/chat/chatThreadIndex');
    vi.mocked(loadThreadIndexItemForContext).mockResolvedValue(cityGroupItem('city-1'));

    const firstPaint = await prepareUsersTabDexFirstPaint([], [gameItem('g1')], 'me', []);
    expect(firstPaint[0]?.type === 'group' && firstPaint[0].data.id).toBe('city-1');

    const networkSettle = await prepareChatsForVisibleApply(firstPaint, 'users', 'me', [], false);
    expect(shouldSkipRedundantNetworkVisibleApply(firstPaint, networkSettle, 'users')).toBe(true);
    expect(chatListVisibleApplySig(firstPaint)).toBe(chatListVisibleApplySig(networkSettle));
  });
});
