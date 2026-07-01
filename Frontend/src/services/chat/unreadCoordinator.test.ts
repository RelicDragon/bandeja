import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contextKey } from '@/services/chat/unreadSnapshot';
import { emptyUnreadTotals } from '@/services/chat/unreadSnapshot';

const applySocketDeltaMock = vi.fn();
const refreshAllMock = vi.fn().mockResolvedValue(undefined);
const getUnreadCountForContextMock = vi.fn().mockResolvedValue(0);

const baseByContext: Record<string, number> = {};
const displayedByContext: Record<string, number> = {};

function projectionMockState() {
  return {
    byContext: baseByContext,
    baseByContext,
    displayedByContext,
    optimistic: {},
    markInFlight: new Set<string>(),
    markReadConfirmedKeys: new Set<string>(),
    reconciledInboundMessageIds: new Set<string>(),
    contextRevisions: {},
    groupChannelMeta: {},
    mutedGroupIds: new Set<string>(),
    myGameIds: new Set<string>(),
    pastGameIds: new Set<string>(),
    totals: emptyUnreadTotals(),
    lastAppliedSnapshotRevision: 0,
    maxSeenUserUnreadRevision: 0,
    refreshRepairMeta: null,
    fetchedAt: Date.now(),
    version: 1,
    lastEnteredContextKey: null,
    applySocketDelta: (...args: unknown[]) => {
      applySocketDeltaMock(...args);
      const delta = args[0] as { contextType: string; contextId: string; unreadCount: number };
      const k = `${delta.contextType}:${delta.contextId}`;
      if (delta.unreadCount <= 0) delete baseByContext[k];
      else baseByContext[k] = delta.unreadCount;
      if (delta.unreadCount <= 0) delete displayedByContext[k];
      else displayedByContext[k] = delta.unreadCount;
    },
    refreshAll: refreshAllMock,
  };
}

vi.mock('@/store/unreadStore', () => ({
  useUnreadStore: {
    getState: projectionMockState,
    setState: vi.fn(),
  },
}));

vi.mock('@/services/chat/unreadProjectionEffects', () => ({
  runUnreadProjectionEffects: vi.fn(),
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

vi.mock('@/services/chat/chatMutationNetwork', () => ({
  shouldQueueChatMutation: () => false,
}));

import {
  onMarkReadBatchFlushFailure,
  onMarkReadBatchFlushSuccess,
} from '@/services/chat/unreadCoordinator';

describe('unreadCoordinator Phase 0 harm-reduction (#236)', () => {
  const key = contextKey('USER', 'chat-1');

  const authorityAck = {
    markedCount: 1,
    unreadCount: 0,
    contextKey: key,
    clock: { userUnreadRevision: 1, userContextUnreadRevision: 1 },
    reason: 'mark_context_read',
    clientOpId: 'op-test',
  };

  beforeEach(() => {
    applySocketDeltaMock.mockClear();
    refreshAllMock.mockClear();
    getUnreadCountForContextMock.mockClear();
    Object.keys(baseByContext).forEach((k) => delete baseByContext[k]);
    Object.keys(displayedByContext).forEach((k) => delete displayedByContext[k]);
  });

  it('onMarkReadBatchFlushSuccess skips refreshContext when local count is already 0', () => {
    displayedByContext[key] = 0;

    onMarkReadBatchFlushSuccess(key, authorityAck);

    expect(applySocketDeltaMock).toHaveBeenCalledWith(
      expect.objectContaining({ unreadCount: 0, clock: authorityAck.clock })
    );
    expect(getUnreadCountForContextMock).not.toHaveBeenCalled();
    expect(refreshAllMock).not.toHaveBeenCalled();
  });

  it('onMarkReadBatchFlushSuccess skips refreshContext after optimistic clear removed sparse key', () => {
    delete displayedByContext[key];

    onMarkReadBatchFlushSuccess(key, authorityAck);

    expect(getUnreadCountForContextMock).not.toHaveBeenCalled();
    expect(refreshAllMock).not.toHaveBeenCalled();
  });

  it('onMarkReadBatchFlushSuccess with authority ack clears count without repair refetch', () => {
    displayedByContext[key] = 2;

    onMarkReadBatchFlushSuccess(key, authorityAck);

    expect(applySocketDeltaMock).toHaveBeenCalledWith(
      expect.objectContaining({ unreadCount: 0, clock: authorityAck.clock })
    );
    expect(getUnreadCountForContextMock).not.toHaveBeenCalled();
    expect(refreshAllMock).not.toHaveBeenCalled();
  });

  it('onMarkReadBatchFlushSuccess without authority envelope does not apply delta', () => {
    onMarkReadBatchFlushSuccess(key);

    expect(applySocketDeltaMock).not.toHaveBeenCalled();
  });

  it('onMarkReadBatchFlushFailure schedules repair via refreshAll', () => {
    onMarkReadBatchFlushFailure(key);

    expect(refreshAllMock).toHaveBeenCalled();
    expect(getUnreadCountForContextMock).not.toHaveBeenCalled();
  });
});
