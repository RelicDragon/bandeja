import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const threadRows = new Map<string, { serverMaxSeq: number; updatedAt: number }>();
const cursorRows = new Map<string, number>();

vi.mock('../chatLocalDb', () => ({
  chatCursorKey: (ct: string, id: string) => `${ct}:${id}`,
  chatLocalDb: {
    chatThreads: {
      get: vi.fn(async (key: string) => {
        const row = threadRows.get(key);
        return row ? { key, serverMaxSeq: row.serverMaxSeq, updatedAt: row.updatedAt } : undefined;
      }),
    },
  },
}));

vi.mock('../chatLocalApplyCursor', () => ({
  BATCH_HEAD_CACHE_MS: 30_000,
  getLocalCursorSeq: vi.fn(async (ct: string, id: string) => cursorRows.get(`${ct}:${id}`) ?? 0),
}));

import { shouldSkipCaughtUpSyncPull } from '../chatLocalApplyCaughtUpPull';
import {
  forgetInMemoryMessageDeletedCaughtUpBypassForTests,
  noteMessageDeletedForCaughtUpPull,
  resetMessageDeletedCaughtUpBypassForTests,
} from '../chatLocalMessageTombstone';

describe('shouldSkipCaughtUpSyncPull', () => {
  beforeEach(() => {
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
    threadRows.clear();
    cursorRows.clear();
    resetMessageDeletedCaughtUpBypassForTests();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('skips when the batch-head cache is fresh and local is caught up', async () => {
    threadRows.set('GAME:g1', { serverMaxSeq: 12, updatedAt: Date.now() });
    cursorRows.set('GAME:g1', 12);

    expect(await shouldSkipCaughtUpSyncPull('GAME', 'g1')).toBe(true);
  });

  it('does not skip when a MESSAGE_DELETED tombstone is still unapplied', async () => {
    threadRows.set('GAME:g1', { serverMaxSeq: 12, updatedAt: Date.now() });
    cursorRows.set('GAME:g1', 12);
    noteMessageDeletedForCaughtUpPull('GAME', 'g1', 13);

    expect(await shouldSkipCaughtUpSyncPull('GAME', 'g1')).toBe(false);
  });

  it('does not skip after a cold-reload in-memory drop while the delete seq is unapplied', async () => {
    threadRows.set('GAME:g1', { serverMaxSeq: 12, updatedAt: Date.now() });
    cursorRows.set('GAME:g1', 12);
    noteMessageDeletedForCaughtUpPull('GAME', 'g1', 13);
    forgetInMemoryMessageDeletedCaughtUpBypassForTests();

    expect(await shouldSkipCaughtUpSyncPull('GAME', 'g1')).toBe(false);
  });

  it('skips when the delete seq is already on the local cursor', async () => {
    threadRows.set('GAME:g1', { serverMaxSeq: 13, updatedAt: Date.now() });
    cursorRows.set('GAME:g1', 13);
    noteMessageDeletedForCaughtUpPull('GAME', 'g1', 13);

    expect(await shouldSkipCaughtUpSyncPull('GAME', 'g1')).toBe(true);
  });

  it('does not skip when forcePull is set', async () => {
    threadRows.set('GAME:g1', { serverMaxSeq: 12, updatedAt: Date.now() });
    cursorRows.set('GAME:g1', 12);

    expect(await shouldSkipCaughtUpSyncPull('GAME', 'g1', { forcePull: true })).toBe(false);
  });
});
