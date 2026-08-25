import { beforeEach, describe, expect, it, vi } from 'vitest';

const order: string[] = [];
const settleMock = vi.fn();
const ensureConnectionMock = vi.fn(() => order.push('socket'));
const ensurePushMock = vi.fn(async () => {
  order.push('push');
});

vi.mock('@capacitor/app', () => ({ App: {} }));
vi.mock('@/utils/capacitor', () => ({ isCapacitor: () => true }));
vi.mock('@/api/authStartup', () => ({ settleStoredAuthOnForeground: settleMock }));
vi.mock('@/store/authStore', () => ({
  useAuthStore: { getState: () => ({ isAuthenticated: true, isInitializing: false, token: 'fresh' }) },
}));
vi.mock('@/services/socketService', () => ({
  socketService: {
    ensureConnection: ensureConnectionMock,
    waitForConnection: vi.fn(async () => {}),
    getActiveChatRooms: vi.fn(() => []),
  },
}));
vi.mock('@/services/chatSyncService', () => ({
  chatSyncService: { refreshUnreadAndList: vi.fn(async () => {}) },
}));
vi.mock('@/services/pushNotificationService', () => ({
  default: { ensureTokenSentToBackend: ensurePushMock },
}));
vi.mock('@/store/chatSyncStore', () => ({
  useChatSyncStore: { getState: () => ({ syncInProgress: false }) },
}));
vi.mock('@/services/chat/chatSyncBatchWarm', () => ({
  warmChatSyncHeads: vi.fn(),
  collectContextsForWarmEnriched: vi.fn(async () => []),
  shouldDeferImplicitChatWarm: () => true,
}));
vi.mock('@/components/GameDetails/gameDetailsChromeStore', () => ({
  useGameDetailsChromeStore: { getState: () => ({}) },
}));
vi.mock('@/services/chat/chatSyncAppVisibility', () => ({ setChatSyncNativeAppActive: vi.fn() }));
vi.mock('@/services/chat/chatSyncMetrics', () => ({ recordChatSyncForegroundSyncMs: vi.fn() }));
vi.mock('@/services/chat/chatOutboxExpiry', () => ({ purgeExpiredFailedOutbox: vi.fn() }));
vi.mock('@/services/chat/chatUnifiedOfflineFlush', () => ({
  flushAllChatOfflineQueues: vi.fn(),
  scheduleUnifiedChatOfflineFlush: vi.fn(),
}));
vi.mock('@/utils/foregroundChatSyncRegistry', () => ({ registerForegroundChatSync: vi.fn() }));
vi.mock('@/services/chat/chatPersistentStorage', () => ({
  ensureChatPersistentStorageOnce: vi.fn(),
  probeChatStoragePressure: vi.fn(),
}));
vi.mock('@/services/push/chatViewingBridge', () => ({
  cleanupNativeChatViewingSync: vi.fn(),
  initNativeChatViewingSync: vi.fn(),
}));
vi.mock('@/services/chat/chatHotThreadPrefetch', () => ({
  scheduleChatHotThreadPrefetchFromIdle: vi.fn(),
  runHotThreadPrefetchNow: vi.fn(),
}));

describe('foreground auth barrier', () => {
  beforeEach(() => {
    order.length = 0;
    vi.clearAllMocks();
  });

  it('settles access credentials before starting socket and push synchronization', async () => {
    settleMock.mockImplementation(async () => {
      order.push('auth');
      return { status: 'refreshed' };
    });
    const { runAuthenticatedForegroundSync } = await import('@/services/appLifecycle.service');

    await runAuthenticatedForegroundSync();

    expect(order).toEqual(['auth', 'socket', 'push']);
  });

  it('does not start authenticated sync while refresh is transiently unavailable', async () => {
    settleMock.mockResolvedValue({ status: 'degraded' });
    const { runAuthenticatedForegroundSync } = await import('@/services/appLifecycle.service');

    await runAuthenticatedForegroundSync();

    expect(ensureConnectionMock).not.toHaveBeenCalled();
    expect(ensurePushMock).not.toHaveBeenCalled();
  });
});
