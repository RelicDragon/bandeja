import { beforeEach, describe, expect, it, vi } from 'vitest';

const cursorState = new Map<string, number>();

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
  },
}));

vi.mock('../chatLocalApplyPull', () => ({
  pullEventsLoop: vi.fn(async () => ({
    repairedStaleCursor: false,
    threadInvalidated: false,
    eventsApplied: 0,
  })),
}));

vi.mock('../chatLocalApplySyncTimers', () => ({
  clearPendingSocketSeqReconcileTimer: vi.fn(),
  markChatPullCompleted: vi.fn(),
  scheduleReconcileWhenSocketSeqMissing: vi.fn(),
}));

vi.mock('../chatOfflineBanner', () => ({
  chatSyncPullStarted: vi.fn(),
  chatSyncPullEnded: vi.fn(),
}));

vi.mock('../chatTailRecover', () => ({
  persistLatestTailPagesAfterStaleCursor: vi.fn(async () => {}),
}));

import { bumpCursor, getLocalCursorSeq } from '../chatLocalApplyCursor';
import { pullEventsLoop } from '../chatLocalApplyPull';
import { onSocketSyncSeqDirect } from '../chatLocalApplySocketInbound';

describe('onSocketSyncSeqDirect gap fill', () => {
  beforeEach(() => {
    cursorState.clear();
    vi.clearAllMocks();
  });

  it('no-ops when syncSeq is not ahead of local cursor', async () => {
    await bumpCursor('USER', 'u1', 10);
    await onSocketSyncSeqDirect('USER', 'u1', 5);
    expect(pullEventsLoop).not.toHaveBeenCalled();
    expect(await getLocalCursorSeq('USER', 'u1')).toBe(10);
  });

  it('pulls events and advances cursor to syncSeq when gap detected', async () => {
    await bumpCursor('USER', 'u1', 3);
    await onSocketSyncSeqDirect('USER', 'u1', 7);
    expect(pullEventsLoop).toHaveBeenCalledWith('USER', 'u1');
    expect(await getLocalCursorSeq('USER', 'u1')).toBe(7);
  });
});
