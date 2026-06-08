import { describe, expect, it } from 'vitest';
import type { GroupChannel } from '@/api/chat';
import type { Game } from '@/types';
import type { ChatItem } from '@/utils/chatListSort';
import { mergeDexThreadIndexForUsersTab } from './chatListDexMerge';

function groupItem(id: string, updatedAt: string, isCityGroup = false): ChatItem {
  return {
    type: 'group',
    data: { id, name: id, updatedAt, isCityGroup } as GroupChannel,
    lastMessageDate: new Date(updatedAt),
    unreadCount: 0,
  };
}

function gameItem(id: string, updatedAt: string): ChatItem {
  return {
    type: 'game',
    data: { id, name: id, updatedAt, status: 'ACTIVE' } as Game,
    lastMessageDate: new Date(updatedAt),
    unreadCount: 0,
  };
}

describe('mergeDexThreadIndexForUsersTab', () => {
  it('sorts merged users and games partitions by activity (not concat order)', () => {
    const usersSlice = [groupItem('city', '2026-06-08T10:00:00Z', true)];
    const gamesSlice = [gameItem('newer-game', '2026-06-09T12:00:00Z')];
    const merged = mergeDexThreadIndexForUsersTab(usersSlice, gamesSlice, 'me');
    expect(merged.map((c) => (c.type === 'game' ? c.data.id : c.data.id))).toEqual([
      'city',
      'newer-game',
    ]);
  });

  it('dedupes the same game present in both partitions', () => {
    const game = gameItem('g1', '2026-06-09T12:00:00Z');
    const merged = mergeDexThreadIndexForUsersTab([game], [game], 'me');
    expect(merged).toHaveLength(1);
  });

  it('places city groups before non-city chats regardless of activity', () => {
    const usersSlice = [groupItem('dm', '2026-06-09T20:00:00Z')];
    const gamesSlice = [gameItem('hot-game', '2026-06-09T19:00:00Z')];
    const city = groupItem('novi-sad', '2026-06-01T08:00:00Z', true);
    const merged = mergeDexThreadIndexForUsersTab([city, ...usersSlice], gamesSlice, 'me');
    expect(merged[0]?.type === 'group' && merged[0].data.id).toBe('novi-sad');
  });
});
