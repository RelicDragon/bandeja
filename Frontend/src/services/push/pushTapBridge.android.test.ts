import { beforeEach, describe, expect, it, vi } from 'vitest';

const consumePendingTapMock = vi.fn();
const addListenerMock = vi.fn(async () => ({ remove: vi.fn() }));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => 'android',
  },
  registerPlugin: () => ({
    consumePendingTap: consumePendingTapMock,
    addListener: addListenerMock,
  }),
}));

describe('pushTapBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    consumePendingTapMock.mockResolvedValue({
      pending: true,
      actionId: 'tap',
      notification: { id: 'mid-1', data: { type: 'INVITE', inviteId: 'i1' } },
    });
    addListenerMock.mockResolvedValue({ remove: vi.fn() });
  });

  it('consumePendingPushTapNative returns plugin payload on android', async () => {
    const { consumePendingPushTapNative } = await import('./pushTapBridge');
    const result = await consumePendingPushTapNative();
    expect(consumePendingTapMock).toHaveBeenCalledTimes(1);
    expect(result?.pending).toBe(true);
    expect(result?.notification?.data).toMatchObject({ type: 'INVITE', inviteId: 'i1' });
  });

  it('addPendingPushTapListener wires pendingPushTap', async () => {
    const { addPendingPushTapListener } = await import('./pushTapBridge');
    const listener = vi.fn();
    await addPendingPushTapListener(listener);
    expect(addListenerMock).toHaveBeenCalledWith('pendingPushTap', listener);
  });
});
