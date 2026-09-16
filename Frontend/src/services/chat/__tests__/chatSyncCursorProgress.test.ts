import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatSyncEventsPack } from '../chatSyncFetchWorkerClient';

const applyThreadTerminalMock = vi.fn();
const fetchPackMock = vi.fn();
const applyPatchesMock = vi.fn();
const messagesBulkDeleteMock = vi.fn();

vi.mock('../chatThreadLifecycle', () => ({
  applyThreadTerminal: (...args: unknown[]) => applyThreadTerminalMock(...args),
}));

vi.mock('@/services/chat/chatSyncFetchWorkerClient', () => ({
  fetchChatSyncEventsPackOffMainThread: (...args: unknown[]) => fetchPackMock(...args),
}));

vi.mock('@/services/chat/chatHttpRetry', () => ({
  withChatSyncRetry: (_label: string, fn: () => Promise<unknown>) => fn(),
}));

vi.mock('../chatSyncEventsToPatches', () => ({
  chatSyncEventsToPatches: vi.fn(() => []),
}));

vi.mock('../chatSyncApplyPatches', () => ({
  applyChatSyncPatchesInSlice: (...args: unknown[]) => applyPatchesMock(...args),
}));

vi.mock('../chatLocalApplyBulk', () => ({
  withChatLocalBulkApply: (fn: () => Promise<void>) => fn(),
}));

vi.mock('../chatLocalCoop', () => ({
  broadcastChatPullHint: vi.fn(),
  ensureChatLocalCoopListener: vi.fn(),
}));

vi.mock('../chatLocalDb', () => ({
  chatCursorKey: (ct: string, id: string) => `${ct}:${id}`,
  chatLocalDb: {
    chatThreads: { get: vi.fn(async () => ({ serverMaxSeq: 10, updatedAt: Date.now() })) },
    chatSyncCursor: {
      get: vi.fn(async (key: string) => ({ key, lastAppliedSeq: cursor.seq, updatedAt: 0 })),
      put: vi.fn(async (row: { lastAppliedSeq: number }) => { cursor.seq = row.lastAppliedSeq; }),
    },
    messages: {
      get: vi.fn(),
      bulkDelete: (...args: unknown[]) => messagesBulkDeleteMock(...args),
      where: vi.fn(() => ({ equals: () => ({ primaryKeys: async () => [] }) })),
    },
    messageSearchTokens: {},
    transaction: vi.fn(async (_mode: string, _tables: unknown, fn: () => Promise<unknown>) => fn()),
  },
}));

vi.mock('../chatLocalApplyWrite', () => ({
  persistChatMessagesFromApiDirect: vi.fn(async () => {}),
}));

vi.mock('../chatLocalApplyPersistMessage', () => ({
  persistCreatedEventMediaTombstones: vi.fn(async () => []),
}));

vi.mock('@/services/chat/chatMediaThumbPrefetch', () => ({
  scheduleChatMediaThumbPrefetchForMessage: vi.fn(),
}));

const notifyInboundMessageSeenMock = vi.fn();

vi.mock('@/services/chat/unreadInboundMessage', () => ({
  notifyInboundMessageSeen: (...args: unknown[]) => notifyInboundMessageSeenMock(...args),
}));

vi.mock('../chatSyncRowUtils', () => ({
  rowFromMessage: vi.fn(),
}));

vi.mock('../chatThreadIndex', () => ({
  patchThreadIndexAfterMessageDeleted: vi.fn(async () => {}),
  patchThreadIndexFromMessage: vi.fn(async () => {}),
}));

vi.mock('../messageContextHead', () => ({
  bumpMessageContextHead: vi.fn(async () => {}),
  refreshMessageContextHeadAfterDelete: vi.fn(async () => {}),
}));

vi.mock('@/utils/chatSyncStaleEvents', () => ({
  dispatchChatSyncStale: vi.fn(),
}));

vi.mock('@/services/chat/chatSyncMetrics', () => ({
  recordChatSyncStaleDispatch: vi.fn(),
}));

import { pullAndApplyChatSyncEventsDirect } from '../chatLocalApplyPull';
import { broadcastChatPullHint } from '../chatLocalCoop';

const cursor = vi.hoisted(() => ({ seq: 0 }));
const pendingPulls = vi.hoisted(() => [] as Array<() => Promise<unknown>>);
vi.mock('../chatSyncScheduler', () => ({
  SYNC_PRIORITY_GAP: 85,
  enqueueChatSyncPull: () => pendingPulls.push(() => pullAndApplyChatSyncEventsDirect('GAME', 'g1')),
}));

const emptyPack = { events: [], hasMore: false, cursorStale: false };
const event = (seq: number) => ({
  id: `event-${seq}`, seq, eventType: 'MESSAGE_UPDATED', payload: {}, createdAt: '2026-09-16T00:00:00Z',
});

beforeEach(() => {
  vi.clearAllMocks();
  cursor.seq = 0;
  pendingPulls.length = 0;
  fetchPackMock.mockReset();
  applyPatchesMock.mockResolvedValue({ putMessagesForMedia: [], patchMessageFallbacks: [], persistedMessages: [] });
});

describe('chat sync cursor progress', () => {
  it.each([false, true])('does not requeue an exhausted legacy page (hasMore=%s)', async (hasMore) => {
    fetchPackMock.mockResolvedValue({ ...emptyPack, hasMore });
    await pullAndApplyChatSyncEventsDirect('GAME', 'g1');
    for (let i = 0; i < 5; i++) {
      await new Promise(resolve => setTimeout(resolve, 0));
      const next = pendingPulls.shift();
      if (!next) break;
      await next();
    }
    expect(fetchPackMock.mock.calls).toEqual([['GAME', 'g1', 0, 300]]);
    expect(cursor.seq).toBe(0);
    expect(broadcastChatPullHint).not.toHaveBeenCalled();
  });

  it('advances past a hidden-only page and continues to visible events', async () => {
    fetchPackMock.mockResolvedValueOnce({ ...emptyPack, hasMore: true, nextAfterSeq: 8 });
    fetchPackMock.mockResolvedValueOnce({ ...emptyPack, events: [event(9)], nextAfterSeq: 10 });
    const result = await pullAndApplyChatSyncEventsDirect('GAME', 'g1');
    expect(fetchPackMock.mock.calls).toEqual([['GAME', 'g1', 0, 300], ['GAME', 'g1', 8, 300]]);
    expect(cursor.seq).toBe(10);
    expect(result.eventsApplied).toBe(1);
    expect(pendingPulls).toHaveLength(0);
  });

  it('stops on an exhausted hidden-only page', async () => {
    fetchPackMock.mockResolvedValue({ ...emptyPack, nextAfterSeq: 10 });
    await pullAndApplyChatSyncEventsDirect('GAME', 'g1');
    expect(cursor.seq).toBe(10);
    expect(fetchPackMock).toHaveBeenCalledTimes(1);
  });

  it('never advances the scan cursor past a visible message that was not persisted', async () => {
    fetchPackMock.mockResolvedValue({
      ...emptyPack, hasMore: true, nextAfterSeq: 10,
      events: [{ ...event(3), eventType: 'MESSAGE_CREATED', payload: { message: { id: 'unsaved' } } }],
    });
    const result = await pullAndApplyChatSyncEventsDirect('GAME', 'g1');
    expect(result.blockedOnUnapplied).toBe(true);
    expect(cursor.seq).toBe(0);
    expect(fetchPackMock).toHaveBeenCalledTimes(1);
    expect(pendingPulls).toHaveLength(0);
  });

  it('can fetch a new visible event after a previous empty response', async () => {
    fetchPackMock.mockResolvedValueOnce(emptyPack);
    await pullAndApplyChatSyncEventsDirect('GAME', 'g1');
    fetchPackMock.mockResolvedValueOnce({ ...emptyPack, events: [event(11)], nextAfterSeq: 11 });
    const result = await pullAndApplyChatSyncEventsDirect('GAME', 'g1', { expectedServerMaxSeq: 11 });
    expect(result.eventsApplied).toBe(1);
    expect(cursor.seq).toBe(11);
    expect(fetchPackMock).toHaveBeenCalledTimes(2);
  });

  it('still pages visible events from older servers without nextAfterSeq', async () => {
    fetchPackMock.mockResolvedValueOnce({ ...emptyPack, hasMore: true, events: [event(3)] });
    fetchPackMock.mockResolvedValueOnce({ ...emptyPack, events: [event(4)] });
    await pullAndApplyChatSyncEventsDirect('GAME', 'g1');
    expect(fetchPackMock.mock.calls).toEqual([['GAME', 'g1', 0, 300], ['GAME', 'g1', 3, 300]]);
    expect(cursor.seq).toBe(4);
  });

  it.each([0, -1, NaN, 1.5])('stops when a scan cursor makes no valid progress: %s', async (nextAfterSeq) => {
    fetchPackMock.mockResolvedValue({ ...emptyPack, hasMore: true, nextAfterSeq } satisfies ChatSyncEventsPack);
    await pullAndApplyChatSyncEventsDirect('GAME', 'g1');
    expect(fetchPackMock).toHaveBeenCalledTimes(1);
    expect(cursor.seq).toBe(0);
    expect(pendingPulls).toHaveLength(0);
  });
});
