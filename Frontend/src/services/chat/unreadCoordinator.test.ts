import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contextKey } from '@/services/chat/unreadSnapshot';

const applySocketDeltaMock = vi.fn();
const refreshAllMock = vi.fn().mockResolvedValue(undefined);
const restoreContextMock = vi.fn();
const getUnreadCountForContextMock = vi.fn().mockResolvedValue(0);

const byContext: Record<string, number> = {};
const markInFlight = new Set<string>();
const pendingRestore = new Map<string, number>();

vi.mock('@/store/unreadStore', () => ({
  useUnreadStore: {
    getState: () => ({
      byContext,
      applySocketDelta: (...args: unknown[]) => {
        applySocketDeltaMock(...args);
        const delta = args[0] as { contextType: string; contextId: string; unreadCount: number };
        const k = `${delta.contextType}:${delta.contextId}`;
        if (delta.unreadCount === 0 && (byContext[k] ?? 0) > 0) {
          pendingRestore.set(k, byContext[k] ?? 0);
        }
        byContext[k] = delta.unreadCount;
      },
      refreshAll: refreshAllMock,
      restoreContext: (...args: unknown[]) => {
        restoreContextMock(...args);
        const [k, prev] = args as [string, number];
        byContext[k] = prev;
        pendingRestore.delete(k);
      },
      markInFlight,
    }),
    setState: vi.fn((partial: { markInFlight?: Set<string> }) => {
      if (partial.markInFlight) {
        markInFlight.clear();
        for (const entry of partial.markInFlight) markInFlight.add(entry);
      }
    }),
  },
}));

vi.mock('@/api/chat', () => ({
  chatApi: {
    getUnreadCountForContext: (...args: unknown[]) => getUnreadCountForContextMock(...args),
    markContextRead: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('@/services/chat/offlineIntent', () => ({
  OfflineIntent: { enqueue: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/services/chat/chatOfflineBanner', () => ({
  shouldQueueChatMutation: () => false,
}));

import {
  onMarkReadBatchFlushFailure,
  onMarkReadBatchFlushSuccess,
} from '@/services/chat/unreadCoordinator';

describe('unreadCoordinator mark-read refresh (Phase 0 #234)', () => {
  const key = contextKey('USER', 'chat-1');

  beforeEach(() => {
    applySocketDeltaMock.mockClear();
    refreshAllMock.mockClear();
    restoreContextMock.mockClear();
    getUnreadCountForContextMock.mockClear();
    Object.keys(byContext).forEach((k) => delete byContext[k]);
    pendingRestore.clear();
    markInFlight.clear();
  });

  it('onMarkReadBatchFlushSuccess skips refreshContext when local count is already 0', () => {
    byContext[key] = 0;

    onMarkReadBatchFlushSuccess(key);

    expect(applySocketDeltaMock).toHaveBeenCalledWith(
      expect.objectContaining({ unreadCount: 0 })
    );
    expect(getUnreadCountForContextMock).not.toHaveBeenCalled();
    expect(refreshAllMock).not.toHaveBeenCalled();
  });

  it('onMarkReadBatchFlushSuccess calls refreshContext when local count was still > 0', () => {
    byContext[key] = 2;

    onMarkReadBatchFlushSuccess(key);

    expect(getUnreadCountForContextMock).toHaveBeenCalledWith('USER', 'chat-1');
  });

  it('onMarkReadBatchFlushFailure schedules repair via refreshContext', () => {
    onMarkReadBatchFlushFailure(key);

    expect(restoreContextMock).toHaveBeenCalledWith(key, 0);
    expect(getUnreadCountForContextMock).toHaveBeenCalledWith('USER', 'chat-1');
  });
});
