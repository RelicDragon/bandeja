import { describe, expect, it } from 'vitest';
import {
  destinationsFromChatItems,
  filterBlockedForwardDestinations,
  mergeForwardDestinations,
  type ForwardDestination,
} from './forwardDestinations';
import type { ChatItem } from '@/utils/chatListSort';
import type { GroupChannel, UserChat } from '@/api/chat';

const t = ((key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key) as never;

function userItem(id: string, name: string, chatId = id): ChatItem {
  const chat = {
    id: chatId,
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

function asDest(item: ChatItem, userId = 'me'): ForwardDestination {
  const d = destinationsFromChatItems([item], userId, t)[0];
  if (!d) throw new Error('expected dest');
  return d;
}

describe('forwardDestinations', () => {
  it('maps local items and excludes current chat', () => {
    const dest = destinationsFromChatItems(
      [userItem('a', 'Alice', 'uc-a'), userItem('b', 'Bob', 'uc-b')],
      'me',
      t,
      { contextType: 'USER', contextId: 'uc-a' }
    );
    expect(dest.map((d) => d.contextId)).toEqual(['uc-b']);
  });

  it('drops subscriber-only broadcast channels', () => {
    const dest = destinationsFromChatItems(
      [channelItem('pub', { isChannel: true, isOwner: false, isParticipant: true })],
      'me',
      t
    );
    expect(dest).toEqual([]);
  });

  it('filters blocked DMs from local destinations', () => {
    const dest = destinationsFromChatItems(
      [userItem('blocked', 'Blocked', 'uc-b'), userItem('ok', 'Ok', 'uc-ok')],
      'me',
      t,
      undefined,
      ['blocked']
    );
    expect(dest.map((d) => d.contextId)).toEqual(['uc-ok']);
  });

  it('filterBlockedForwardDestinations drops blocked peers', () => {
    const dests = destinationsFromChatItems(
      [userItem('x', 'X', 'uc-x')],
      'me',
      t
    );
    expect(filterBlockedForwardDestinations(dests, 'me', ['x'])).toEqual([]);
  });

  it('merges network onto local without dupes and refreshes item', () => {
    const localItem = userItem('a', 'Alice', 'uc-a');
    const networkUser = userItem('a', 'Alice', 'uc-a');
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
    const local: ForwardDestination[] = [asDest(localItem)];
    const network: ForwardDestination[] = [
      {
        ...asDest(networkUser),
        title: 'A2',
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
    expect(merged.map((d) => d.contextId)).toEqual(['uc-a', 'g1']);
    expect(merged[0].item).toBe(networkUser);
    expect(merged[0].preview).toBe('x');
  });

  it('networkAuthoritative drops local-only DMs', () => {
    const localOnly = asDest(userItem('gone', 'Gone', 'uc-gone'));
    const networkKeep = asDest(userItem('keep', 'Keep', 'uc-keep'));
    const merged = mergeForwardDestinations([localOnly, networkKeep], [networkKeep], {
      networkAuthoritative: true,
    });
    expect(merged.map((d) => d.contextId)).toEqual(['uc-keep']);
  });
});
