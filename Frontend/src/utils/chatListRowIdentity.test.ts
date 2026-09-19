import { describe, expect, it } from 'vitest';
import type { ChatDraft, UserChat } from '@/api/chat';
import type { ChatItem } from '@/components/chat/chatListTypes';
import { applyDraftsToChatItems, deduplicateChats } from './chatListHelpers';

/**
 * Row identity is load-bearing for the inbox: every clone invalidates the memoized
 * row, re-measures the animated list and can restart enter motion. These paths run
 * on filter switch, network settle and draft reapply, so an unchanged row must come
 * back as the same object.
 */

/** Mirrors a settled row: `lastMessageDate` already folds in the draft timestamp. */
function userRow(id: string, updatedAt = '2026-02-01T10:00:00Z', draft: ChatDraft | null = null): ChatItem {
  const settledAt = draft
    ? new Date(Math.max(new Date(updatedAt).getTime(), new Date(draft.updatedAt).getTime()))
    : new Date(updatedAt);
  return {
    type: 'user',
    data: { id, user1Id: 'me', user2Id: `u-${id}`, updatedAt } as UserChat,
    lastMessageDate: settledAt,
    unreadCount: 0,
    draft,
  } as ChatItem;
}

function draftFor(contextId: string, updatedAt: string, content: string): ChatDraft {
  return {
    id: `d-${contextId}`,
    userId: 'me',
    chatContextType: 'USER',
    contextId,
    chatType: 'PUBLIC',
    content,
    mentionIds: [],
    updatedAt,
    createdAt: updatedAt,
  } as unknown as ChatDraft;
}

describe('deduplicateChats', () => {
  it('returns the same array when there is nothing to drop', () => {
    const rows = [userRow('a'), userRow('b')];
    expect(deduplicateChats(rows)).toBe(rows);
  });

  it('returns a new array when a duplicate is removed', () => {
    const rows = [userRow('a'), userRow('a')];
    const out = deduplicateChats(rows);
    expect(out).not.toBe(rows);
    expect(out).toHaveLength(1);
  });
});

describe('applyDraftsToChatItems', () => {
  it('keeps row and list identity when no row carries a draft', () => {
    const rows = [userRow('a'), userRow('b')];
    const out = applyDraftsToChatItems(rows, [draftFor('other', '2026-02-01T11:00:00Z', 'hi')], 'users', 'me');
    expect(out).toBe(rows);
    expect(out[0]).toBe(rows[0]);
  });

  it('keeps identity when the same draft is re-fetched as a fresh object', () => {
    const draft = draftFor('a', '2026-02-02T10:00:00Z', 'wip');
    const rows = [userRow('a', '2026-02-01T10:00:00Z', draft), userRow('b')];
    const refetched = draftFor('a', '2026-02-02T10:00:00Z', 'wip');
    expect(refetched).not.toBe(draft);

    const out = applyDraftsToChatItems(rows, [refetched], 'users', 'me', false);
    expect(out).toBe(rows);
    expect(out[0]).toBe(rows[0]);
  });

  it('clones only the row whose draft content changed', () => {
    const rows = [
      userRow('a', '2026-02-01T10:00:00Z', draftFor('a', '2026-02-02T10:00:00Z', 'old')),
      userRow('b'),
    ];
    const out = applyDraftsToChatItems(
      rows,
      [draftFor('a', '2026-02-03T10:00:00Z', 'new')],
      'users',
      'me',
      false
    );

    expect(out).not.toBe(rows);
    expect(out[0]).not.toBe(rows[0]);
    expect(out[0] && 'draft' in out[0] ? out[0].draft?.content : null).toBe('new');
    expect(out[1]).toBe(rows[1]);
  });
});
