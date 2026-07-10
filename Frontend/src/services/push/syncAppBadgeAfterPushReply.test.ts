import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUnreadTotalsMock = vi.fn();
const syncBadgeMock = vi.fn();

vi.mock('@/store/unreadStore', () => ({
  selectTotalAll: () => 7,
  useUnreadStore: {
    getState: () => ({}),
  },
}));

vi.mock('@/api/chat', () => ({
  chatApi: {
    getUnreadTotals: (...args: unknown[]) => getUnreadTotalsMock(...args),
  },
}));

vi.mock('@/services/chat/syncAppIconBadgeFromStore', () => ({
  syncAppIconBadgeFromStore: (...args: unknown[]) => syncBadgeMock(...args),
}));

import { syncAppBadgeAfterPushReply } from '@/services/push/syncAppBadgeAfterPushReply';

describe('syncAppBadgeAfterPushReply (Phase 5 #245)', () => {
  beforeEach(() => {
    getUnreadTotalsMock.mockClear();
    syncBadgeMock.mockClear();
    getUnreadTotalsMock.mockResolvedValue({ data: { total: 5, userUnreadRevision: 1 } });
  });

  it('uses server unreadBadgeCount from push-reply response', async () => {
    await syncAppBadgeAfterPushReply(3);

    expect(syncBadgeMock).toHaveBeenCalledWith(3);
    expect(getUnreadTotalsMock).not.toHaveBeenCalled();
  });

  it('falls back to GET /chat/unread-totals when badge count omitted', async () => {
    await syncAppBadgeAfterPushReply(undefined);

    expect(getUnreadTotalsMock).toHaveBeenCalledTimes(1);
    expect(syncBadgeMock).toHaveBeenCalledWith(5);
  });

  it('falls back to local store totals when cheap fetch fails', async () => {
    getUnreadTotalsMock.mockRejectedValue(new Error('offline'));

    await syncAppBadgeAfterPushReply(undefined);

    expect(syncBadgeMock).toHaveBeenCalledWith(7);
  });
});
