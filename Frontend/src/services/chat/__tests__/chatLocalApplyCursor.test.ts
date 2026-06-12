import { beforeEach, describe, expect, it, vi } from 'vitest';

const threadRows = new Map<string, { serverMaxSeq: number; updatedAt: number }>();
const cursorRows = new Map<string, number>();
const getChatSyncHeadMock = vi.fn();

vi.mock('@/api/chat', () => ({
  chatApi: {
    getChatSyncHead: (...args: unknown[]) => getChatSyncHeadMock(...args),
  },
}));

vi.mock('../chatLocalCoop', () => ({
  broadcastChatPullHint: vi.fn(),
}));

vi.mock('../chatLocalDb', () => ({
  chatCursorKey: (ct: string, id: string) => `${ct}:${id}`,
  chatLocalDb: {
    chatThreads: {
      get: vi.fn(async (key: string) => {
        const row = threadRows.get(key);
        return row ? { key, serverMaxSeq: row.serverMaxSeq, updatedAt: row.updatedAt } : undefined;
      }),
    },
    chatSyncCursor: {
      get: vi.fn(async (key: string) => {
        const seq = cursorRows.get(key);
        return seq != null ? { key, lastAppliedSeq: seq, updatedAt: 0 } : undefined;
      }),
    },
  },
}));

import { reconcileCursorWithServerHead } from '../chatLocalApplyCursor';

describe('reconcileCursorWithServerHead', () => {
  beforeEach(() => {
    threadRows.clear();
    cursorRows.clear();
    getChatSyncHeadMock.mockReset();
  });

  it('uses fresh batch-head cache when local cursor is behind', async () => {
    threadRows.set('USER:u1', { serverMaxSeq: 12, updatedAt: Date.now() });
    cursorRows.set('USER:u1', 8);

    await reconcileCursorWithServerHead('USER', 'u1');

    expect(getChatSyncHeadMock).not.toHaveBeenCalled();
  });

  it('fetches head when caught up locally but server may have advanced', async () => {
    threadRows.set('USER:u1', { serverMaxSeq: 12, updatedAt: Date.now() });
    cursorRows.set('USER:u1', 12);
    getChatSyncHeadMock.mockResolvedValue(12);

    await reconcileCursorWithServerHead('USER', 'u1');

    expect(getChatSyncHeadMock).toHaveBeenCalledWith('USER', 'u1');
  });
});
