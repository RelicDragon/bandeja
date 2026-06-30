import { describe, expect, it } from 'vitest';
import { contextKey } from '@/services/chat/unreadSnapshot';
import type { ChatItem } from '@/utils/chatListSort';
import { selectContextUnreadForListItem } from '@/store/unreadStore';
import { emptyUnreadTotals } from '@/services/chat/unreadSnapshot';

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
});
