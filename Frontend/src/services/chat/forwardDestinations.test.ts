import { describe, expect, it } from 'vitest';
import {
  destinationsFromChatItems,
  mergeForwardDestinations,
  type ForwardDestination,
} from './forwardDestinations';
import type { ChatItem } from '@/utils/chatListSort';
import type { GroupChannel, UserChat } from '@/api/chat';

const t = ((key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key) as never;

function userItem(id: string, name: string): ChatItem {
  const chat = {
    id,
    user1Id: 'me',
    user2Id: id,
    user1: { id: 'me', firstName: 'Me', lastName: '' },
    user2: { id, firstName: name, lastName: '' },
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastMessage: null,
  } as unknown as UserChat;
  return {
    type: 'user',
    data: chat,
    lastMessageDate: null,
    unreadCount: 0,
    otherUser: chat.user2,
    draft: null,
  };
}

function channelItem(id: string, opts: { isChannel?: boolean; isOwner?: boolean; isParticipant?: boolean }): ChatItem {
  const data = {
    id,
    name: `Ch ${id}`,
    isChannel: opts.isChannel ?? true,
    isOwner: opts.isOwner ?? false,
    isParticipant: opts.isParticipant ?? true,
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastMessage: null,
  } as unknown as GroupChannel;
  return {
    type: 'channel',
    data,
    lastMessageDate: null,
    unreadCount: 0,
    draft: null,
  };
}

describe('forwardDestinations', () => {
  it('maps local items and excludes current chat', () => {
    const dest = destinationsFromChatItems(
      [userItem('a', 'Alice'), userItem('b', 'Bob')],
      'me',
      t,
      { contextType: 'USER', contextId: 'a' }
    );
    expect(dest.map((d) => d.contextId)).toEqual(['b']);
  });

  it('drops subscriber-only broadcast channels', () => {
    const dest = destinationsFromChatItems(
      [channelItem('pub', { isChannel: true, isOwner: false, isParticipant: true })],
      'me',
      t
    );
    expect(dest).toEqual([]);
  });

  it('merges network onto local without dupes and refreshes item', () => {
    const localItem = userItem('a', 'Alice');
    const networkUser = userItem('a', 'Alice');
    const gameItem = {
      type: 'game' as const,
      data: {
        id: 'g1',
        name: 'Game',
        status: 'READY',
        entityType: 'GAME',
        updatedAt: '2026-01-01T00:00:00.000Z',
        lastMessage: null,
      },
      lastMessageDate: null,
      unreadCount: 0,
      draft: null,
    } as unknown as ChatItem;
    const local: ForwardDestination[] = [
      {
        contextType: 'USER',
        contextId: 'a',
        title: 'A',
        kind: 'user',
        preview: '',
        item: localItem as Exclude<ChatItem, { type: 'contact' }>,
      },
    ];
    const network: ForwardDestination[] = [
      {
        contextType: 'USER',
        contextId: 'a',
        title: 'A2',
        kind: 'user',
        preview: 'x',
        item: networkUser as Exclude<ChatItem, { type: 'contact' }>,
      },
      {
        contextType: 'GAME',
        contextId: 'g1',
        title: 'Game',
        kind: 'game',
        preview: '',
        item: gameItem as Exclude<ChatItem, { type: 'contact' }>,
      },
    ];
    const merged = mergeForwardDestinations(local, network);
    expect(merged.map((d) => d.contextId)).toEqual(['a', 'g1']);
    expect(merged[0].item).toBe(networkUser);
    expect(merged[0].preview).toBe('x');
  });
});
