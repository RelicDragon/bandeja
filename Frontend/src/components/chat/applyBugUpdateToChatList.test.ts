import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bug } from '@/types';
import { useChatListFeedStore } from './chatListFeedStore';
import type { ChatItem } from './chatListTypes';

const patchThreadIndexGroupChannelBug = vi.fn(async () => {});
vi.mock('@/services/chat/chatThreadIndex', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/chat/chatThreadIndex')>()),
  patchThreadIndexGroupChannelBug: (...args: unknown[]) =>
    (patchThreadIndexGroupChannelBug as (...a: unknown[]) => Promise<void>)(...args),
}));

const { applyBugUpdateToChatList } = await import('./applyBugUpdateToChatList');

function bugRow(channelId: string, bugId: string, status = 'CREATED'): ChatItem {
  return {
    type: 'channel',
    data: {
      id: channelId,
      name: `Bug ${bugId}`,
      updatedAt: '2026-01-01T00:00:00.000Z',
      bugId,
      bug: { id: bugId, text: 't', status, bugType: 'BUG', priority: 0, senderId: 's' },
    },
    lastMessageDate: null,
    unreadCount: 0,
  } as ChatItem;
}

const saved = (id: string, status: Bug['status']) =>
  ({ id, status, bugType: 'BUG', priority: 2, updatedAt: '2026-02-02T00:00:00.000Z' }) as Bug;

const bugOf = (row: ChatItem | undefined) =>
  row && (row.type === 'channel' || row.type === 'group') ? row.data.bug : undefined;

describe('applyBugUpdateToChatList', () => {
  beforeEach(() => {
    useChatListFeedStore.getState().resetForTests();
    patchThreadIndexGroupChannelBug.mockClear();
  });

  it('patches the matching bug row in the visible list and the thread index', () => {
    const store = useChatListFeedStore.getState();
    store.setActiveFilter('bugs');
    store.commitFilterCache('bugs', { chats: [bugRow('c1', 'b1'), bugRow('c2', 'b2')] });

    applyBugUpdateToChatList(saved('b1', 'IN_PROGRESS'));

    const rows = useChatListFeedStore.getState().rows;
    expect(bugOf(rows[0])).toMatchObject({ status: 'IN_PROGRESS', priority: 2 });
    expect(bugOf(rows[1])?.status).toBe('CREATED');
    expect(patchThreadIndexGroupChannelBug).toHaveBeenCalledTimes(1);
    expect(patchThreadIndexGroupChannelBug).toHaveBeenCalledWith('c1', expect.objectContaining({ status: 'IN_PROGRESS' }));
  });

  it('applies consecutive edits in order', () => {
    const store = useChatListFeedStore.getState();
    store.setActiveFilter('bugs');
    store.commitFilterCache('bugs', { chats: [bugRow('c1', 'b1')] });

    applyBugUpdateToChatList(saved('b1', 'IN_PROGRESS'));
    applyBugUpdateToChatList(saved('b1', 'TEST'));

    expect(bugOf(useChatListFeedStore.getState().rows[0])?.status).toBe('TEST');
  });

  it('still patches the thread index for an unloaded channel when its id is known', () => {
    applyBugUpdateToChatList(saved('b9', 'FINISHED'), 'c9');
    expect(patchThreadIndexGroupChannelBug).toHaveBeenCalledWith('c9', expect.objectContaining({ id: 'b9' }));
  });
});
