import { beforeEach, describe, expect, it, vi } from 'vitest';

const setBadgeMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/services/authBridge', () => ({
  setAppIconBadgeCountNative: (...args: unknown[]) => setBadgeMock(...args),
}));

vi.mock('@/utils/capacitor', () => ({
  isCapacitor: () => true,
}));

const selectTotalAllMock = vi.fn(() => 0);

vi.mock('@/store/unreadStore', () => ({
  selectTotalAll: () => selectTotalAllMock(),
  useUnreadStore: {
    getState: () => ({}),
  },
}));

import { syncAppIconBadgeFromStore } from '@/services/chat/syncAppIconBadgeFromStore';

describe('syncAppIconBadgeFromStore', () => {
  beforeEach(() => {
    setBadgeMock.mockClear();
    selectTotalAllMock.mockReturnValue(0);
  });

  it('sets native badge from store total even when already zero', () => {
    syncAppIconBadgeFromStore();
    expect(setBadgeMock).toHaveBeenCalledWith(0);
  });

  it('clears stale native badge when store total is zero', () => {
    selectTotalAllMock.mockReturnValue(0);
    syncAppIconBadgeFromStore();
    expect(setBadgeMock).toHaveBeenCalledWith(0);
  });

  it('uses explicit count when provided (projection effect before store commit)', () => {
    selectTotalAllMock.mockReturnValue(5);
    syncAppIconBadgeFromStore(0);
    expect(setBadgeMock).toHaveBeenCalledWith(0);
  });

  it('reflects non-zero store total', () => {
    selectTotalAllMock.mockReturnValue(2);
    syncAppIconBadgeFromStore();
    expect(setBadgeMock).toHaveBeenCalledWith(2);
  });
});
