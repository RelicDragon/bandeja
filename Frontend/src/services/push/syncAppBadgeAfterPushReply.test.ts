import { beforeEach, describe, expect, it, vi } from 'vitest';

const refreshAllMock = vi.fn().mockResolvedValue(undefined);
const getUnreadCountMock = vi.fn();
const setBadgeMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/store/unreadStore', () => ({
  selectTotalAll: () => 7,
  useUnreadStore: {
    getState: () => ({}),
  },
}));

vi.mock('@/api/chat', () => ({
  chatApi: {
    getUnreadCount: (...args: unknown[]) => getUnreadCountMock(...args),
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

describe('syncAppBadgeAfterPushReply (Phase 0 #235)', () => {
  beforeEach(() => {
    refreshAllMock.mockClear();
    getUnreadCountMock.mockClear();
    setBadgeMock.mockClear();
    getUnreadCountMock.mockResolvedValue({ data: { count: 5 } });
  });

  it('uses server unreadBadgeCount from push-reply response without refreshAll', async () => {
    await syncAppBadgeAfterPushReply(3);

    expect(setBadgeMock).toHaveBeenCalledWith(3);
    expect(getUnreadCountMock).not.toHaveBeenCalled();
    expect(refreshAllMock).not.toHaveBeenCalled();
  });

  it('falls back to cheap GET /chat/unread-count when badge count omitted', async () => {
    await syncAppBadgeAfterPushReply(undefined);

    expect(getUnreadCountMock).toHaveBeenCalledTimes(1);
    expect(setBadgeMock).toHaveBeenCalledWith(5);
    expect(refreshAllMock).not.toHaveBeenCalled();
  });

  it('falls back to local store totals when cheap fetch fails', async () => {
    getUnreadCountMock.mockRejectedValue(new Error('offline'));

    await syncAppBadgeAfterPushReply(undefined);

    expect(setBadgeMock).toHaveBeenCalledWith(7);
    expect(refreshAllMock).not.toHaveBeenCalled();
  });
});
