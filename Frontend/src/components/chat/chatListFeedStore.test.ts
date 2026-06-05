import { describe, expect, it, beforeEach } from 'vitest';
import type { ChatMessage } from '@/api/chat';
import { useChatListFeedStore } from './chatListFeedStore';
import type { ChatItem } from './chatListTypes';
import { updateChatMessageInList } from './chatListModelMessageUpdates';

function userRow(id: string, unread = 0): ChatItem {
  return {
    type: 'user',
    data: {
      id,
      user1Id: 'me',
      user2Id: `other-${id}`,
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    lastMessageDate: null,
    unreadCount: unread,
    otherUser: { id: `other-${id}`, firstName: 'A', lastName: 'B' },
  } as ChatItem;
}

function groupRow(id: string): ChatItem {
  return {
    type: 'group',
    data: { id, name: `Group ${id}`, updatedAt: '2026-01-01T00:00:00.000Z' },
    lastMessageDate: null,
    unreadCount: 0,
  } as ChatItem;
}

describe('chatListFeedStore filter transitions', () => {
  beforeEach(() => {
    useChatListFeedStore.getState().resetForTests();
  });

  it('restores rows from per-filter cache when active filter changes', () => {
    const store = useChatListFeedStore.getState();
    store.setUserId('user-1');
    store.commitFilterCache('users', { chats: [userRow('u1')] }, { userId: 'user-1', applyToVisible: false });
    store.commitFilterCache('bugs', { chats: [groupRow('b1')], bugsHasMore: true }, { userId: 'user-1', applyToVisible: false });

    store.setActiveFilter('users');
    store.commitFilterCache('users', { chats: [userRow('u1')] }, { userId: 'user-1' });
    expect(useChatListFeedStore.getState().rows).toHaveLength(1);
    expect(useChatListFeedStore.getState().rows[0]?.type).toBe('user');

    store.setActiveFilter('bugs');
    store.commitFilterCache('bugs', { chats: [groupRow('b1')], bugsHasMore: true }, { userId: 'user-1' });
    expect(useChatListFeedStore.getState().rows).toHaveLength(1);
    expect(useChatListFeedStore.getState().rows[0]?.type).toBe('group');
    expect(useChatListFeedStore.getState().pagination.bugs.hasMore).toBe(true);
  });

  it('keeps inactive filter cache when patching active rows', () => {
    const store = useChatListFeedStore.getState();
    store.setUserId('user-1');
    store.commitFilterCache('users', { chats: [userRow('u1')] }, { userId: 'user-1' });
    store.commitFilterCache('bugs', { chats: [groupRow('b1')] }, { userId: 'user-1', applyToVisible: false });

    store.patchRows((prev) => [...prev, userRow('u2')]);

    expect(useChatListFeedStore.getState().getFilterCache('users')?.chats).toHaveLength(2);
    expect(useChatListFeedStore.getState().getFilterCache('bugs')?.chats).toHaveLength(1);
  });
});

describe('chatListFeedStore socket row patch', () => {
  beforeEach(() => {
    useChatListFeedStore.getState().resetForTests();
  });

  it('patches a row and syncs active filter cache', () => {
    const store = useChatListFeedStore.getState();
    store.setUserId('user-1');
    store.setActiveFilter('users');
    store.commitFilterCache('users', { chats: [userRow('chat-1', 2)] }, { userId: 'user-1' });

    const message = {
      id: 'msg-1',
      content: 'hello',
      createdAt: '2026-06-01T12:00:00.000Z',
      updatedAt: '2026-06-01T12:00:00.000Z',
      chatContextType: 'USER',
      contextId: 'chat-1',
    } as ChatMessage;

    store.patchRows((prev) =>
      updateChatMessageInList(prev, 'USER', 'chat-1', message, 'users', 'user-1')
    );

    const rows = useChatListFeedStore.getState().rows;
    expect(rows[0]?.type).toBe('user');
    if (rows[0]?.type === 'user') {
      expect(rows[0].data.lastMessage?.content).toBe('hello');
    }
    expect(useChatListFeedStore.getState().getFilterCache('users')?.chats[0]?.type).toBe('user');
  });
});

describe('chatListFeedStore draft reapply', () => {
  beforeEach(() => {
    useChatListFeedStore.getState().resetForTests();
  });

  it('reapplies drafts to rows and filter cache', () => {
    const store = useChatListFeedStore.getState();
    store.setUserId('user-1');
    store.setActiveFilter('users');
    store.commitFilterCache('users', { chats: [userRow('chat-1')] }, { userId: 'user-1' });

    store.reapplyDrafts(
      [
        {
          id: 'd1',
          chatContextType: 'USER',
          contextId: 'chat-1',
          chatType: 'TEXT',
          content: 'draft text',
          updatedAt: '2026-06-01T13:00:00.000Z',
        },
      ],
      'users',
      'user-1'
    );

    const row = useChatListFeedStore.getState().rows[0];
    expect(row && 'draft' in row && row.draft?.content).toBe('draft text');
    const cached = useChatListFeedStore.getState().getFilterCache('users')?.chats[0];
    expect(cached && 'draft' in cached && cached.draft?.content).toBe('draft text');
  });
});
