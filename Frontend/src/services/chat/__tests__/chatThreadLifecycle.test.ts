import { beforeEach, describe, expect, it, vi } from 'vitest';

const purgeLocalDexieThreadMock = vi.fn();
const leaveChatRoomMock = vi.fn();
const cancelSendMock = vi.fn();
const getByContextMock = vi.fn();
const removeOutboxMock = vi.fn();
const chatThreadsPutMock = vi.fn();
const chatThreadsGetMock = vi.fn();
const chatSyncCursorPutMock = vi.fn();
const chatSyncCursorGetMock = vi.fn();
const dispatchStaleMock = vi.fn();
const recordStaleMock = vi.fn();

vi.mock('../chatLocalThreadPurge', () => ({
  purgeLocalDexieThread: (...args: unknown[]) => purgeLocalDexieThreadMock(...args),
}));

vi.mock('@/services/socketService', () => ({
  socketService: { leaveChatRoom: (...args: unknown[]) => leaveChatRoomMock(...args) },
}));

vi.mock('@/services/chatSendService', () => ({
  cancelSend: (...args: unknown[]) => cancelSendMock(...args),
}));

vi.mock('@/services/chatMessageQueueStorage', () => ({
  messageQueueStorage: {
    getByContext: (...args: unknown[]) => getByContextMock(...args),
    remove: (...args: unknown[]) => removeOutboxMock(...args),
  },
}));

vi.mock('../chatLocalDb', () => ({
  chatCursorKey: (ct: string, id: string) => `${ct}:${id}`,
  chatLocalDb: {
    chatThreads: {
      get: (...args: unknown[]) => chatThreadsGetMock(...args),
      put: (...args: unknown[]) => chatThreadsPutMock(...args),
    },
    chatSyncCursor: {
      get: (...args: unknown[]) => chatSyncCursorGetMock(...args),
      put: (...args: unknown[]) => chatSyncCursorPutMock(...args),
    },
    transaction: vi.fn(
      async (_mode: string, _tables: unknown, fn: () => Promise<void>) => fn()
    ),
  },
}));

vi.mock('@/utils/chatSyncStaleEvents', () => ({
  dispatchChatSyncStale: (...args: unknown[]) => dispatchStaleMock(...args),
}));

vi.mock('@/services/chat/chatSyncMetrics', () => ({
  recordChatSyncStaleDispatch: (...args: unknown[]) => recordStaleMock(...args),
}));

import {
  applyThreadTerminal,
  dropPendingOutboxForContext,
  isThreadArchivedLocally,
  isThreadArchivedInMemory,
  clearThreadArchivedInMemory,
} from '../chatThreadLifecycle';

describe('chatThreadLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearThreadArchivedInMemory('GAME', 'g1');
    clearThreadArchivedInMemory('GAME', 'g2');
    clearThreadArchivedInMemory('GAME', 'g3');
    clearThreadArchivedInMemory('GAME', 'g4');
    chatThreadsGetMock.mockResolvedValue(undefined);
    chatSyncCursorGetMock.mockResolvedValue(undefined);
    getByContextMock.mockResolvedValue([]);
  });

  it('invalidate purges dexie and dispatches threadInvalidated stale', async () => {
    await applyThreadTerminal('invalidate', 'GAME', 'g1');

    expect(purgeLocalDexieThreadMock).toHaveBeenCalledWith('GAME', 'g1');
    expect(recordStaleMock).toHaveBeenCalled();
    expect(dispatchStaleMock).toHaveBeenCalledWith('GAME', 'g1', 'threadInvalidated');
    expect(leaveChatRoomMock).not.toHaveBeenCalled();
  });

  it('archived sets metadata, advances cursor, leaves room, drops outbox, does not purge', async () => {
    getByContextMock.mockResolvedValue([
      { tempId: 't1', contextType: 'GAME', contextId: 'g2', status: 'queued' },
    ]);
    chatThreadsGetMock.mockResolvedValue({ key: 'GAME:g2', serverMaxSeq: 4, updatedAt: 1 });
    chatSyncCursorGetMock.mockResolvedValue({ key: 'GAME:g2', lastAppliedSeq: 3, updatedAt: 1 });

    await applyThreadTerminal('archived', 'GAME', 'g2', { syncSeq: 9, archivedAt: 1_700_000_000_000 });

    expect(purgeLocalDexieThreadMock).not.toHaveBeenCalled();
    expect(leaveChatRoomMock).toHaveBeenCalledWith('GAME', 'g2');
    expect(cancelSendMock).toHaveBeenCalledWith('t1');
    expect(removeOutboxMock).toHaveBeenCalledWith('t1', 'GAME', 'g2');
    expect(chatThreadsPutMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'GAME:g2', archivedAt: 1_700_000_000_000 })
    );
    expect(chatSyncCursorPutMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'GAME:g2', lastAppliedSeq: 9 })
    );
    expect(dispatchStaleMock).not.toHaveBeenCalled();
  });

  it('dropPendingOutboxForContext removes all pending rows', async () => {
    getByContextMock.mockResolvedValue([
      { tempId: 't2', contextType: 'USER', contextId: 'u1', status: 'failed' },
    ]);

    const tempIds = await dropPendingOutboxForContext('USER', 'u1');

    expect(tempIds).toEqual(['t2']);
    expect(cancelSendMock).toHaveBeenCalledWith('t2');
    expect(removeOutboxMock).toHaveBeenCalledWith('t2', 'USER', 'u1');
  });

  it('isThreadArchivedLocally hydrates in-memory registry from Dexie', async () => {
    chatThreadsGetMock.mockResolvedValueOnce(undefined);
    expect(await isThreadArchivedLocally('GAME', 'g3')).toBe(false);

    chatThreadsGetMock.mockResolvedValueOnce({ key: 'GAME:g3', serverMaxSeq: 0, updatedAt: 0, archivedAt: 1 });
    expect(isThreadArchivedInMemory('GAME', 'g3')).toBe(false);
    expect(await isThreadArchivedLocally('GAME', 'g3')).toBe(true);
    expect(isThreadArchivedInMemory('GAME', 'g3')).toBe(true);
  });
});
