import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pullMock = vi.fn();

vi.mock('../chatLocalApply', () => ({
  pullAndApplyChatSyncEvents: (...args: unknown[]) => pullMock(...args),
}));

const cursor = vi.hoisted(() => ({ seq: 0 }));

vi.mock('../chatLocalApplyCursor', () => ({
  getLocalCursorSeq: vi.fn(async () => cursor.seq),
}));

const threads = vi.hoisted(() => new Map<string, Record<string, unknown>>());

vi.mock('../chatLocalDb', () => ({
  chatCursorKey: (ct: string, id: string) => `${ct}:${id}`,
  chatLocalDb: {
    chatThreads: {
      get: vi.fn(async (key: string) => threads.get(key)),
      put: vi.fn(async (row: { key: string }) => {
        threads.set(row.key, row);
      }),
    },
  },
}));

vi.mock('@/services/chat/chatOfflineBanner', () => ({
  chatSyncPullStarted: vi.fn(),
  chatSyncPullEnded: vi.fn(),
  resetChatSyncPullDepth: vi.fn(),
}));

vi.mock('@/services/chat/chatSyncMetrics', () => ({
  recordChatSyncPullFailure: vi.fn(),
  resetChatSyncMetrics: vi.fn(),
}));

vi.mock('@/services/chat/chatSyncAppVisibility', () => ({
  shouldDeferLowPriorityChatSyncPull: () => false,
}));

vi.mock('@/services/chat/purgeGameChatLocal', () => ({
  isGameChatContextGoneHttpError: () => false,
  purgeGameChatLocal: vi.fn(),
}));

import {
  clearChatSyncScheduler,
  enqueueChatSyncPull,
  SYNC_PRIORITY_GAP,
  SYNC_PRIORITY_VIEWING,
  SYNC_PRIORITY_WARM,
} from '../chatSyncScheduler';

/** Runs queued pulls until the scheduler stops starting new ones. */
async function drain(): Promise<void> {
  for (let i = 0; i < 80; i += 1) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  threads.clear();
  cursor.seq = 0;
  clearChatSyncScheduler();
  pullMock.mockReset();
  pullMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('chat sync scheduler loop guard', () => {
  it('cools a gap thread down after repeated pulls that never advance the cursor', async () => {
    threads.set('GAME:g1', { key: 'GAME:g1', serverMaxSeq: 10 });
    for (let i = 0; i < 6; i += 1) {
      enqueueChatSyncPull('GAME', 'g1', SYNC_PRIORITY_GAP);
      await drain();
    }
    expect(pullMock).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(31_000);
    enqueueChatSyncPull('GAME', 'g1', SYNC_PRIORITY_GAP);
    await drain();
    expect(pullMock).toHaveBeenCalledTimes(4);
  });

  it('keeps pulling while the cursor advances', async () => {
    pullMock.mockImplementation(async () => {
      cursor.seq += 1;
    });
    for (let i = 0; i < 6; i += 1) {
      enqueueChatSyncPull('GAME', 'g1', SYNC_PRIORITY_GAP);
      await drain();
    }
    expect(pullMock).toHaveBeenCalledTimes(6);
    expect(threads.get('GAME:g1')?.nextRetryAt).toBeUndefined();
  });

  it('holds a gap pull during the failure backoff instead of bypassing it', async () => {
    pullMock.mockRejectedValueOnce(new Error('429'));
    enqueueChatSyncPull('GAME', 'g1', SYNC_PRIORITY_GAP);
    await drain();
    expect(pullMock).toHaveBeenCalledTimes(1);

    enqueueChatSyncPull('GAME', 'g1', SYNC_PRIORITY_GAP);
    await drain();
    expect(pullMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(23_000);
    await drain();
    expect(pullMock).toHaveBeenCalledTimes(2);
  });
});


it('does not let cooled threads block unrelated ready threads', async () => {
  threads.set('GAME:g1', { key: 'GAME:g1', nextRetryAt: Date.now() + 30_000 });
  threads.set('GAME:g2', { key: 'GAME:g2', nextRetryAt: Date.now() + 30_000 });
  enqueueChatSyncPull('GAME', 'g1', SYNC_PRIORITY_GAP);
  enqueueChatSyncPull('GAME', 'g2', SYNC_PRIORITY_GAP);
  enqueueChatSyncPull('GAME', 'g3', SYNC_PRIORITY_WARM);
  await drain();
  expect(pullMock).toHaveBeenCalledWith('GAME', 'g3', {});
});

it('does not count caught-up checks against a newly advertised head', async () => {
  for (let i = 0; i < 3; i += 1) {
    enqueueChatSyncPull('GAME', 'g1', SYNC_PRIORITY_GAP, { expectedServerMaxSeq: 0 });
    await drain();
  }
  pullMock.mockClear();
  enqueueChatSyncPull('GAME', 'g1', SYNC_PRIORITY_VIEWING, { expectedServerMaxSeq: 1 });
  await drain();
  expect(pullMock).toHaveBeenCalledWith('GAME', 'g1', { expectedServerMaxSeq: 1 });
});

it('preserves newer recovery options queued during a lease read', async () => {
  const { chatLocalDb } = await import('../chatLocalDb');
  let finishOther = () => {};
  pullMock.mockImplementationOnce(() => new Promise<void>((resolve) => { finishOther = resolve; }));
  enqueueChatSyncPull('GAME', 'other', SYNC_PRIORITY_GAP);
  await drain();

  threads.set('GAME:g1', { key: 'GAME:g1', nextRetryAt: Date.now() + 30_000 });
  let finishLease = () => {};
  vi.mocked(chatLocalDb.chatThreads.get).mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => { finishLease = resolve; });
    return threads.get('GAME:g1');
  });
  enqueueChatSyncPull('GAME', 'g1', SYNC_PRIORITY_GAP, { expectedServerMaxSeq: 0 });
  enqueueChatSyncPull('GAME', 'g1', SYNC_PRIORITY_VIEWING, { expectedServerMaxSeq: 1, forcePull: true });
  finishLease();
  await drain();
  finishOther();
  await drain();
  await vi.advanceTimersByTimeAsync(30_001);
  expect(pullMock).toHaveBeenCalledWith('GAME', 'g1', { expectedServerMaxSeq: 1, forcePull: true });
});

async function stallThread(): Promise<void> {
  threads.set('GAME:g1', { key: 'GAME:g1', serverMaxSeq: 10 });
  for (let i = 0; i < 3; i += 1) {
    enqueueChatSyncPull('GAME', 'g1', SYNC_PRIORITY_GAP);
    await drain();
  }
  pullMock.mockClear();
}

it('allows a newer head to restart a thread stalled against the old head', async () => {
  await stallThread();
  enqueueChatSyncPull('GAME', 'g1', SYNC_PRIORITY_VIEWING, { expectedServerMaxSeq: 11 });
  await drain();
  expect(pullMock).toHaveBeenCalledTimes(1);
});

it('resets stalled attempts after socket cursor progress', async () => {
  await stallThread();
  cursor.seq = 1;
  enqueueChatSyncPull('GAME', 'g1', SYNC_PRIORITY_GAP);
  await drain();
  expect(pullMock).toHaveBeenCalledTimes(1);
});

it('does not combine stalled attempts spaced far apart', async () => {
  threads.set('GAME:g1', { key: 'GAME:g1', serverMaxSeq: 10 });
  for (let i = 0; i < 4; i += 1) {
    enqueueChatSyncPull('GAME', 'g1', SYNC_PRIORITY_GAP);
    await drain();
    await vi.advanceTimersByTimeAsync(60_000);
  }
  expect(pullMock).toHaveBeenCalledTimes(4);
  expect(threads.get('GAME:g1')?.nextRetryAt).toBeUndefined();
});

it('still honors real failure backoff when the server head advances', async () => {
  pullMock.mockRejectedValueOnce(new Error('429'));
  enqueueChatSyncPull('GAME', 'g1', SYNC_PRIORITY_GAP);
  await drain();
  enqueueChatSyncPull('GAME', 'g1', SYNC_PRIORITY_VIEWING, { expectedServerMaxSeq: 11, forcePull: true });
  await drain();
  expect(pullMock).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(23_000);
  expect(pullMock).toHaveBeenCalledTimes(2);
});
