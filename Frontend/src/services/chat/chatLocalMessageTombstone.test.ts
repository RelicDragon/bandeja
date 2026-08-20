import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/api/chat';
import {
  beginLocalDeleteApply,
  clearChatMessageTombstone,
  clearMessageDeletedCaughtUpBypass,
  excludeTombstonedChatMessages,
  forgetInMemoryMessageDeletedCaughtUpBypassForTests,
  forgetLocalMessageTombstone,
  isCurrentLocalDeleteApply,
  isRememberedLocalMessageTombstone,
  noteMessageDeletedForCaughtUpPull,
  persistSocketChatDeleted,
  preferDeletedAt,
  rememberLocalMessageTombstone,
  resetMessageDeletedCaughtUpBypassForTests,
  shouldBypassCaughtUpSyncPullForMessageDeleted,
  tombstoneChatMessage,
  tombstoneLocalRow,
} from './chatLocalMessageTombstone';
import type { ChatLocalRow } from './chatLocalDb';

function stubSessionStorage(): void {
  const values = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } satisfies Storage);
}

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

  it('clears a tombstone so failed-delete restore can persist', () => {
    const out = clearChatMessageTombstone(
      tombstoneChatMessage(msg('m1'), '2026-01-01T03:00:00.000Z')
    );
    expect(out.deletedAt).toBeNull();
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
    stubSessionStorage();
    resetMessageDeletedCaughtUpBypassForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('forces a pull when a delete has no syncSeq', () => {
    noteMessageDeletedForCaughtUpPull('GAME', 'g1');
    expect(shouldBypassCaughtUpSyncPullForMessageDeleted('GAME', 'g1')).toBe(true);
  });

  it('forces a pull even after the local cursor already includes the delete seq', () => {
    noteMessageDeletedForCaughtUpPull('GAME', 'g1', 20);
    expect(shouldBypassCaughtUpSyncPullForMessageDeleted('GAME', 'g1')).toBe(true);
  });

  it('clears the bypass after a successful pull', () => {
    noteMessageDeletedForCaughtUpPull('GAME', 'g1', 20);
    clearMessageDeletedCaughtUpBypass('GAME', 'g1');
    expect(shouldBypassCaughtUpSyncPullForMessageDeleted('GAME', 'g1')).toBe(false);
  });

  it('keeps the bypass after an in-memory drop (cold reload / sessionStorage)', () => {
    noteMessageDeletedForCaughtUpPull('GAME', 'g1', 20);
    forgetInMemoryMessageDeletedCaughtUpBypassForTests();
    expect(shouldBypassCaughtUpSyncPullForMessageDeleted('GAME', 'g1')).toBe(true);
  });

  it('notes a skip-pull bypass from chat:deleted before Dexie write', () => {
    persistSocketChatDeleted({
      contextType: 'GAME',
      contextId: 'g1',
      messageId: 'm1',
      syncSeq: 13,
    });
    expect(shouldBypassCaughtUpSyncPullForMessageDeleted('GAME', 'g1')).toBe(true);
    expect(isRememberedLocalMessageTombstone('m1')).toBe(true);
  });

  it('expires the bypass after the skip-pull window', () => {
    noteMessageDeletedForCaughtUpPull('GAME', 'g1', 20);
    vi.setSystemTime(new Date('2026-01-01T00:00:31.000Z'));
    expect(shouldBypassCaughtUpSyncPullForMessageDeleted('GAME', 'g1')).toBe(false);
  });

  it('caps sessionStorage hints so keys cannot grow without bound', () => {
    for (let i = 0; i < 60; i += 1) {
      noteMessageDeletedForCaughtUpPull('GAME', `g${i}`, i + 1);
    }
    let bypassKeys = 0;
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k?.startsWith('bandeja.chat.delBypass.')) bypassKeys += 1;
    }
    expect(bypassKeys).toBeLessThanOrEqual(48);
  });
});

describe('remembered tombstones and apply generation', () => {
  beforeEach(() => {
    stubSessionStorage();
    resetMessageDeletedCaughtUpBypassForTests();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('drops remembered and payload tombstones from open/HTTP rows', () => {
    rememberLocalMessageTombstone('gone');
    const rows = [msg('keep'), msg('gone'), msg('api', '2026-01-01T03:00:00.000Z')];
    expect(excludeTombstonedChatMessages(rows).map((m) => m.id)).toEqual(['keep']);
    forgetLocalMessageTombstone('gone');
    expect(excludeTombstonedChatMessages([msg('gone')]).map((m) => m.id)).toEqual(['gone']);
  });

  it('ignores a stale tombstone write after a newer restore generation', () => {
    const tombstoneGen = beginLocalDeleteApply('m1');
    const restoreGen = beginLocalDeleteApply('m1');
    expect(isCurrentLocalDeleteApply('m1', tombstoneGen)).toBe(false);
    expect(isCurrentLocalDeleteApply('m1', restoreGen)).toBe(true);
  });
});
