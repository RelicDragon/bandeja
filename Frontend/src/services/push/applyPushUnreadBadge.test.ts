import { describe, expect, it, vi } from 'vitest';
import {
  applyPushUnreadBadgeFromNotification,
  parsePushUnreadBadgeCount,
} from '@/services/push/applyPushUnreadBadge';

const setBadgeMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/services/authBridge', () => ({
  setAppIconBadgeCountNative: (...args: unknown[]) => setBadgeMock(...args),
}));

describe('parsePushUnreadBadgeCount', () => {
  it('reads Android flattened unreadBadgeCount', () => {
    expect(
      parsePushUnreadBadgeCount({
        type: 'USER_CHAT',
        unreadBadgeCount: '4',
        messageId: 'm1',
      })
    ).toBe(4);
  });

  it('reads iOS nested data unreadBadgeCount', () => {
    expect(
      parsePushUnreadBadgeCount({
        type: 'USER_CHAT',
        data: { unreadBadgeCount: 9 },
      })
    ).toBe(9);
  });

  it('reads root badge fallback', () => {
    expect(parsePushUnreadBadgeCount({ badge: 2 })).toBe(2);
  });
});

describe('applyPushUnreadBadgeFromNotification', () => {
  it('syncs native badge from push payload', async () => {
    setBadgeMock.mockClear();
    await applyPushUnreadBadgeFromNotification({
      id: 'n1',
      title: 'A',
      body: 'Hi',
      data: { unreadBadgeCount: '5' },
    });
    expect(setBadgeMock).toHaveBeenCalledWith(5);
  });
});
