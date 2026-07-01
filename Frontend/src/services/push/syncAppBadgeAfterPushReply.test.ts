import { beforeEach, describe, expect, it, vi } from 'vitest';

const refreshAllMock = vi.fn().mockResolvedValue(undefined);
const getUnreadTotalsMock = vi.fn();
const setBadgeMock = vi.fn().mockResolvedValue(undefined);

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

vi.mock('@/services/authBridge', () => ({
  setAppIconBadgeCountNative: (...args: unknown[]) => setBadgeMock(...args),
  getAppIconBadgeCountNative: vi.fn().mockResolvedValue(0),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => 'ios',
  },
}));

import { syncAppBadgeAfterPushReply } from '@/services/push/syncAppBadgeAfterPushReply';

describe('syncAppBadgeAfterPushReply (Phase 5 #245)', () => {
  beforeEach(() => {
    refreshAllMock.mockClear();
    getUnreadTotalsMock.mockClear();
    setBadgeMock.mockClear();
    getUnreadTotalsMock.mockResolvedValue({ data: { total: 5, userUnreadRevision: 1 } });
  });

  it('uses server unreadBadgeCount from push-reply response without refreshAll', async () => {
    await syncAppBadgeAfterPushReply(3);

    expect(setBadgeMock).toHaveBeenCalledWith(3);
    expect(getUnreadTotalsMock).not.toHaveBeenCalled();
    expect(refreshAllMock).not.toHaveBeenCalled();
  });

  it('falls back to GET /chat/unread-totals when badge count omitted', async () => {
    await syncAppBadgeAfterPushReply(undefined);

    expect(getUnreadTotalsMock).toHaveBeenCalledTimes(1);
    expect(setBadgeMock).toHaveBeenCalledWith(5);
    expect(refreshAllMock).not.toHaveBeenCalled();
  });

  it('falls back to local store totals when cheap fetch fails', async () => {
    getUnreadTotalsMock.mockRejectedValue(new Error('offline'));

    await syncAppBadgeAfterPushReply(undefined);

    expect(setBadgeMock).toHaveBeenCalledWith(7);
    expect(refreshAllMock).not.toHaveBeenCalled();
  });
});
