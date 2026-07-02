import { beforeEach, describe, expect, it, vi } from 'vitest';

const pullMissedMock = vi.fn().mockResolvedValue([]);
const enqueuePullMock = vi.fn();
const resolveAccessibleGameChatTypesMock = vi.fn();
const refreshAllMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const invalidateUnreadCacheMock = vi.hoisted(() => vi.fn());

vi.mock('@/store/unreadStore', () => ({
  useUnreadStore: {
    getState: () => ({
      refreshAll: refreshAllMock,
    }),
  },
}));

vi.mock('@/api/chat', () => ({
  chatApi: {
    invalidateUnreadCache: invalidateUnreadCacheMock,
  },
}));

vi.mock('@/services/chat/chatThreadNetworkSync', () => ({
  pullMissedAndPersistToDexie: (...args: unknown[]) => pullMissedMock(...args),
}));

vi.mock('@/services/chat/chatLocalApplyThreadEvent', () => ({
  applyThreadEvent: vi.fn(),
}));

vi.mock('@/services/chat/chatOfflineBanner', () => ({
  refreshChatOfflineBanner: vi.fn(),
}));

vi.mock('@/services/chat/chatSyncScheduler', () => ({
  enqueueChatSyncPull: (...args: unknown[]) => enqueuePullMock(...args),
  SYNC_PRIORITY_FOREGROUND: 100,
  SYNC_PRIORITY_VIEWING: 105,
}));

vi.mock('@/services/chat/resolveGameChatSyncTypes', () => ({
  resolveAccessibleGameChatTypes: (...args: unknown[]) => resolveAccessibleGameChatTypesMock(...args),
}));

vi.mock('@/store/chatSyncStore', () => ({
  useChatSyncStore: {
    getState: () => ({
      setSyncInProgress: vi.fn(),
      setLastSyncCompletedAt: vi.fn(),
      syncInProgress: false,
    }),
  },
}));

import { chatSyncService } from '@/services/chatSyncService';

describe('chatSyncService.syncContext', () => {
  beforeEach(() => {
    pullMissedMock.mockClear();
    enqueuePullMock.mockClear();
    resolveAccessibleGameChatTypesMock.mockReset();
    resolveAccessibleGameChatTypesMock.mockResolvedValue(['PUBLIC', 'PRIVATE']);
    refreshAllMock.mockClear();
    invalidateUnreadCacheMock.mockClear();
  });

  it('skips missed pull for GROUP but still enqueues events sync in syncAllContexts', async () => {
    await chatSyncService.syncAllContexts([{ contextType: 'GROUP', contextId: 'g1' }]);

    expect(pullMissedMock).not.toHaveBeenCalled();
    expect(enqueuePullMock).toHaveBeenCalledWith('GROUP', 'g1', 100);
    expect(invalidateUnreadCacheMock).toHaveBeenCalledTimes(1);
    expect(refreshAllMock).toHaveBeenCalledTimes(1);
  });

  it('pulls missed only for accessible game chat types', async () => {
    await chatSyncService.syncContext('GAME', 'game-1');

    expect(resolveAccessibleGameChatTypesMock).toHaveBeenCalledWith('game-1', undefined);
    expect(pullMissedMock).toHaveBeenCalledTimes(2);
    expect(pullMissedMock).toHaveBeenCalledWith({
      contextType: 'GAME',
      contextId: 'game-1',
      gameChatType: 'PUBLIC',
    });
    expect(pullMissedMock).toHaveBeenCalledWith({
      contextType: 'GAME',
      contextId: 'game-1',
      gameChatType: 'PRIVATE',
    });
  });

  it('skips broad missed repair for games during syncAllContexts by default', async () => {
    await chatSyncService.syncAllContexts([{ contextType: 'GAME', contextId: 'game-1' }]);

    expect(resolveAccessibleGameChatTypesMock).not.toHaveBeenCalled();
    expect(pullMissedMock).not.toHaveBeenCalled();
    expect(enqueuePullMock).toHaveBeenCalledWith('GAME', 'game-1', 100);
    expect(invalidateUnreadCacheMock).toHaveBeenCalledTimes(1);
    expect(refreshAllMock).toHaveBeenCalledTimes(1);
  });

  it('skips missed repair when requested explicitly', async () => {
    await chatSyncService.syncContext('GAME', 'game-1', undefined, { skipMissedRepair: true });

    expect(resolveAccessibleGameChatTypesMock).not.toHaveBeenCalled();
    expect(pullMissedMock).not.toHaveBeenCalled();
  });

  it('includes ADMINS when sync context grants admin access', async () => {
    resolveAccessibleGameChatTypesMock.mockResolvedValue(['PUBLIC', 'PRIVATE', 'ADMINS']);
    const gameSyncContext = {
      game: { status: 'SCHEDULED' },
      participant: { status: 'NON_PLAYING', role: 'OWNER' },
    };

    await chatSyncService.syncContext('GAME', 'game-1', undefined, { gameSyncContext });

    expect(resolveAccessibleGameChatTypesMock).toHaveBeenCalledWith('game-1', gameSyncContext);
    expect(pullMissedMock).toHaveBeenCalledTimes(3);
  });

  it('still pulls a single chat type when gameChatType is explicit', async () => {
    await chatSyncService.syncContext('GAME', 'game-1', 'ADMINS');

    expect(resolveAccessibleGameChatTypesMock).not.toHaveBeenCalled();
    expect(pullMissedMock).toHaveBeenCalledTimes(1);
    expect(pullMissedMock).toHaveBeenCalledWith({
      contextType: 'GAME',
      contextId: 'game-1',
      gameChatType: 'ADMINS',
    });
  });
});

describe('chatSyncService.refreshUnreadAndList', () => {
  beforeEach(() => {
    refreshAllMock.mockClear();
    invalidateUnreadCacheMock.mockClear();
  });

  it('invalidates API cache then refreshes unread store once', async () => {
    await chatSyncService.refreshUnreadAndList();

    expect(invalidateUnreadCacheMock).toHaveBeenCalledTimes(1);
    expect(refreshAllMock).toHaveBeenCalledTimes(1);
  });
});
