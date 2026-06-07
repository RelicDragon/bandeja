import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/api/chat';

const cursorState = new Map<string, number>();
const storeLastMessageId = new Map<string, string>();
let listBumpCount = 0;

vi.mock('../chatLocalDb', () => ({
  chatCursorKey: (ct: string, id: string) => `${ct}:${id}`,
  chatLocalDb: {
    chatSyncCursor: {
      get: vi.fn(async (key: string) => {
        const seq = cursorState.get(key);
        return seq != null ? { key, lastAppliedSeq: seq, updatedAt: 0 } : undefined;
      }),
      put: vi.fn(async (row: { key: string; lastAppliedSeq: number }) => {
        const prev = cursorState.get(row.key) ?? 0;
        cursorState.set(row.key, Math.max(prev, row.lastAppliedSeq));
      }),
    },
    messages: { get: vi.fn(), bulkPut: vi.fn(), where: vi.fn() },
    messageSearchTokens: {},
    transaction: vi.fn(),
  },
}));

vi.mock('../chatLocalApplyStoreBridge', () => ({
  bridgeAddMissedMessages: vi.fn(),
  bridgeBumpChatListDexie: vi.fn(() => {
    listBumpCount += 1;
  }),
  bridgeSetLastMessageId: vi.fn(
    (ct: string, id: string, messageId: string | null, gameChatType?: string) => {
      if (!messageId) return;
      const key = gameChatType ? `${ct}:${id}:${gameChatType}` : `${ct}:${id}`;
      storeLastMessageId.set(key, messageId);
    }
  ),
}));

vi.mock('../messageContextHead', () => ({
  syncLastMessageIdsToStoreFromLocalHeadsForContext: vi.fn(async () => {}),
  bumpMessageContextHead: vi.fn(async () => {}),
}));

vi.mock('../chatLocalApplyWrite', () => ({
  putLocalMessageDirect: vi.fn(async () => {}),
  persistChatMessagesFromApiDirect: vi.fn(async () => {}),
}));

vi.mock('../chatLocalApplyPull', () => ({
  pullAndApplyChatSyncEventsDirect: vi.fn(async () => ({
    eventsApplied: 1,
    repairedStaleCursor: false,
    threadInvalidated: false,
  })),
}));

vi.mock('../chatLocalApplySocketInbound', () => ({
  onSocketSyncSeqDirect: vi.fn(async () => {}),
  persistSocketPatchThenSyncSeqDirect: vi.fn(async () => {}),
}));

vi.mock('../chatLocalCoop', () => ({
  broadcastChatPullHint: vi.fn(),
  ensureChatLocalCoopListener: vi.fn(),
}));

vi.mock('../chatLocalApplyQueue', () => ({
  enqueueChatLocalContextApply: vi.fn((_ct: string, _id: string, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('../chatLocalApplySyncTimers', () => ({
  scheduleReconcileWhenSocketSeqMissing: vi.fn(),
}));

import { bumpCursor, getLocalCursorSeq } from '../chatLocalApplyCursor';
import {
  applyThreadEvent,
  getThreadSnapshotRevision,
  resetThreadSnapshotRevisionsForTests,
} from '../chatLocalApplyThreadEvent';
import { bridgeBumpChatListDexie } from '../chatLocalApplyStoreBridge';

function msg(id: string): ChatMessage {
  return {
    id,
    chatContextType: 'USER',
    contextId: 'u1',
    senderId: 's1',
    content: 'hi',
    state: 'SENT',
    chatType: 'PUBLIC',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    reactions: [],
    readReceipts: [],
  };
}

describe('chatLocalApplyCursor monotonicity', () => {
  beforeEach(() => {
    cursorState.clear();
  });

  it('bumpCursor never decreases lastAppliedSeq', async () => {
    await bumpCursor('USER', 'u1', 10);
    await bumpCursor('USER', 'u1', 5);
    expect(await getLocalCursorSeq('USER', 'u1')).toBe(10);
    await bumpCursor('USER', 'u1', 15);
    expect(await getLocalCursorSeq('USER', 'u1')).toBe(15);
  });
});

describe('applyThreadEvent', () => {
  beforeEach(() => {
    cursorState.clear();
    storeLastMessageId.clear();
    listBumpCount = 0;
    resetThreadSnapshotRevisionsForTests();
    vi.clearAllMocks();
  });

  it('sendSuccess bumps snapshot revision and list dexie bump', async () => {
    const rev0 = getThreadSnapshotRevision('USER', 'u1');
    const rev1 = await applyThreadEvent({ kind: 'sendSuccess', message: msg('m1') });
    expect(rev1).toBe(rev0 + 1);
    expect(bridgeBumpChatListDexie).toHaveBeenCalled();
    expect(listBumpCount).toBe(1);
  });

  it('socketSyncSeq delegates gap fill and advances revision', async () => {
    const { onSocketSyncSeqDirect } = await import('../chatLocalApplySocketInbound');
    await bumpCursor('USER', 'u1', 3);
    const rev = await applyThreadEvent({ kind: 'socketSyncSeq', contextType: 'USER', contextId: 'u1', syncSeq: 7 });
    expect(onSocketSyncSeqDirect).toHaveBeenCalledWith('USER', 'u1', 7);
    expect(rev).toBeGreaterThan(0);
  });

  it('uiTailAdvance updates store tail via bridge', async () => {
    await applyThreadEvent({
      kind: 'uiTailAdvance',
      contextType: 'USER',
      contextId: 'u1',
      messageId: 'm-tail',
    });
    expect(storeLastMessageId.get('USER:u1')).toBe('m-tail');
  });

  it('httpMessages persists batch and bumps revision', async () => {
    const { persistChatMessagesFromApiDirect } = await import('../chatLocalApplyWrite');
    const rev = await applyThreadEvent({ kind: 'httpMessages', messages: [msg('m1'), msg('m2')] });
    expect(persistChatMessagesFromApiDirect).toHaveBeenCalled();
    expect(rev).toBe(1);
  });

  it('syncPull delegates to pull path and bumps revision when events applied', async () => {
    const { pullAndApplyChatSyncEventsDirect } = await import('../chatLocalApplyPull');
    const rev = await applyThreadEvent({ kind: 'syncPull', contextType: 'USER', contextId: 'u1' });
    expect(pullAndApplyChatSyncEventsDirect).toHaveBeenCalled();
    expect(rev).toBe(1);
  });

  it('syncPull does not bump revision when pull is a no-op', async () => {
    const { pullAndApplyChatSyncEventsDirect } = await import('../chatLocalApplyPull');
    vi.mocked(pullAndApplyChatSyncEventsDirect).mockResolvedValueOnce({
      eventsApplied: 0,
      repairedStaleCursor: false,
      threadInvalidated: false,
    });
    const rev0 = getThreadSnapshotRevision('USER', 'u1');
    const rev = await applyThreadEvent({ kind: 'syncPull', contextType: 'USER', contextId: 'u1' });
    expect(rev).toBe(rev0);
  });

  it('socketMessage persists via write path and bumps revision', async () => {
    const { putLocalMessageDirect } = await import('../chatLocalApplyWrite');
    const rev = await applyThreadEvent({
      kind: 'socketMessage',
      contextType: 'USER',
      contextId: 'u1',
      message: msg('m-sock'),
      syncSeq: 5,
    });
    expect(putLocalMessageDirect).toHaveBeenCalled();
    expect(rev).toBe(1);
  });

  it('missedBuffer adds to store bridge and bumps revision', async () => {
    const { bridgeAddMissedMessages } = await import('../chatLocalApplyStoreBridge');
    const rev = await applyThreadEvent({
      kind: 'missedBuffer',
      contextType: 'USER',
      contextId: 'u1',
      messages: [msg('m-missed')],
    });
    expect(bridgeAddMissedMessages).toHaveBeenCalledWith('USER', 'u1', [msg('m-missed')], undefined);
    expect(rev).toBe(1);
  });

  it('bulkHydrateTailsFromDexie sets store tails without revision bump', async () => {
    const rev0 = getThreadSnapshotRevision('USER', 'u1');
    await applyThreadEvent({
      kind: 'bulkHydrateTailsFromDexie',
      tails: [
        { contextType: 'USER', contextId: 'u1', messageId: 'm-hydrate' },
        { contextType: 'GAME', contextId: 'g1', messageId: 'm-game', gameChatType: 'PUBLIC' },
      ],
    });
    expect(storeLastMessageId.get('USER:u1')).toBe('m-hydrate');
    expect(storeLastMessageId.get('GAME:g1:PUBLIC')).toBe('m-game');
    expect(getThreadSnapshotRevision('USER', 'u1')).toBe(rev0);
    expect(bridgeBumpChatListDexie).not.toHaveBeenCalled();
  });
});
