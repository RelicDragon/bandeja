import { beforeEach, describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/api/chat';
import {
  clearMessageDeletedCaughtUpBypass,
  noteMessageDeletedForCaughtUpPull,
  preferDeletedAt,
  resetMessageDeletedCaughtUpBypassForTests,
  shouldBypassCaughtUpSyncPullForMessageDeleted,
  tombstoneChatMessage,
  tombstoneLocalRow,
} from './chatLocalMessageTombstone';
import type { ChatLocalRow } from './chatLocalDb';

function msg(id: string, deletedAt?: string | null): ChatMessage {
  return {
    id,
    chatContextType: 'GAME',
    contextId: 'g1',
    senderId: 's1',
    content: 'hi',
    state: 'SENT',
    chatType: 'PRIVATE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    reactions: [],
    readReceipts: [],
    ...(deletedAt !== undefined ? { deletedAt } : {}),
  };
}

describe('preferDeletedAt', () => {
  it('keeps an existing tombstone when incoming omits deletedAt', () => {
    expect(preferDeletedAt('2026-01-01T01:00:00.000Z', undefined)).toBe('2026-01-01T01:00:00.000Z');
  });

  it('keeps an existing tombstone when incoming is null', () => {
    expect(preferDeletedAt('2026-01-01T01:00:00.000Z', null)).toBe('2026-01-01T01:00:00.000Z');
  });

  it('prefers incoming tombstone when both are set', () => {
    expect(preferDeletedAt('2026-01-01T01:00:00.000Z', '2026-01-01T02:00:00.000Z')).toBe(
      '2026-01-01T02:00:00.000Z'
    );
  });
});

describe('tombstone helpers', () => {
  it('stamps deletedAt on a chat message', () => {
    const out = tombstoneChatMessage(msg('m1'), '2026-01-01T03:00:00.000Z');
    expect(out.deletedAt).toBe('2026-01-01T03:00:00.000Z');
    expect(out.id).toBe('m1');
  });

  it('stamps deletedAt on a local row', () => {
    const payload = msg('m1');
    const row: ChatLocalRow = {
      id: 'm1',
      contextType: 'GAME',
      contextId: 'g1',
      chatType: 'PRIVATE',
      createdAt: 1,
      sortKey: 'a',
      payload,
    };
    const out = tombstoneLocalRow(row, '2026-01-01T03:00:00.000Z');
    expect(out.deletedAt).toBe(Date.parse('2026-01-01T03:00:00.000Z'));
    expect(out.payload.deletedAt).toBe('2026-01-01T03:00:00.000Z');
  });
});

describe('MESSAGE_DELETED caught-up pull bypass', () => {
  beforeEach(() => {
    resetMessageDeletedCaughtUpBypassForTests();
  });

  it('forces a pull when a delete has no syncSeq', () => {
    noteMessageDeletedForCaughtUpPull('GAME', 'g1');
    expect(shouldBypassCaughtUpSyncPullForMessageDeleted('GAME', 'g1', 12)).toBe(true);
  });

  it('forces a pull while local cursor is behind the delete seq', () => {
    noteMessageDeletedForCaughtUpPull('GAME', 'g1', 20);
    expect(shouldBypassCaughtUpSyncPullForMessageDeleted('GAME', 'g1', 19)).toBe(true);
    expect(shouldBypassCaughtUpSyncPullForMessageDeleted('GAME', 'g1', 20)).toBe(false);
  });

  it('clears the bypass after a successful pull', () => {
    noteMessageDeletedForCaughtUpPull('GAME', 'g1', 20);
    clearMessageDeletedCaughtUpBypass('GAME', 'g1');
    expect(shouldBypassCaughtUpSyncPullForMessageDeleted('GAME', 'g1', 0)).toBe(false);
  });
});
