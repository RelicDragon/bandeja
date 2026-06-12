import { beforeEach, describe, expect, it, vi } from 'vitest';

const pullMissedMock = vi.fn().mockResolvedValue([]);
const enqueuePullMock = vi.fn();

vi.mock('@/api/chat', () => ({
  chatApi: {
    invalidateUnreadCache: vi.fn(),
    getUnreadObjects: vi.fn().mockResolvedValue({ data: null }),
  },
}));

vi.mock('@/services/chat/chatThreadNetworkSync', () => ({
  pullMissedAndPersistToDexie: (...args: unknown[]) => pullMissedMock(...args),
}));

vi.mock('@/services/chat/chatLocalApplyThreadEvent', () => ({
  applyThreadEvent: vi.fn(),
}));

vi.mock('@/services/chat/chatSyncBatchWarm', () => ({
  scheduleWarmFromUnreadApiPayload: vi.fn(),
}));

vi.mock('@/services/chat/chatOfflineBanner', () => ({
  refreshChatOfflineBanner: vi.fn(),
}));

vi.mock('@/services/chat/chatSyncScheduler', () => ({
  enqueueChatSyncPull: (...args: unknown[]) => enqueuePullMock(...args),
  SYNC_PRIORITY_FOREGROUND: 100,
  SYNC_PRIORITY_VIEWING: 105,
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
  });

  it('skips missed pull for GROUP but still enqueues events sync in syncAllContexts', async () => {
    await chatSyncService.syncAllContexts([{ contextType: 'GROUP', contextId: 'g1' }]);

    expect(pullMissedMock).not.toHaveBeenCalled();
    expect(enqueuePullMock).toHaveBeenCalledWith('GROUP', 'g1', 100);
  });

  it('still pulls missed for GAME rooms', async () => {
    await chatSyncService.syncContext('GAME', 'game-1');

    expect(pullMissedMock).toHaveBeenCalledTimes(3);
  });
});
