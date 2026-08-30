import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const checkPermissionsMock = vi.fn();
const requestPermissionsMock = vi.fn();
const registerMock = vi.fn();
const addListenerMock = vi.fn(async () => undefined);
const removeAllListenersMock = vi.fn(async () => undefined);
const getPlatformMock = vi.fn(() => 'ios');
const releaseLauncherIconBlockMock = vi.fn();
const blockLauncherIconChangesMock = vi.fn(() => releaseLauncherIconBlockMock);

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: getPlatformMock,
  },
  registerPlugin: () => ({}),
}));

vi.mock('@/services/androidLauncherIconScheduler', () => ({
  blockAndroidLauncherIconChangesForNativeUi: blockLauncherIconChangesMock,
}));

vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    checkPermissions: checkPermissionsMock,
    requestPermissions: requestPermissionsMock,
    register: registerMock,
    addListener: addListenerMock,
    removeAllListeners: removeAllListenersMock,
  },
}));

vi.mock('@/utils/capacitor', () => ({
  getAppInfo: vi.fn(async () => ({ version: '1.0.0', buildNumber: '1' })),
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      isAuthenticated: true,
      isInitializing: false,
      token: 'valid.jwt.token',
    }),
  },
}));

vi.mock('@/api/authRefresh', () => ({
  decodeJwtExpMs: () => Date.now() + 60_000,
}));

vi.mock('@/api/axios', () => ({
  default: { post: vi.fn(async () => ({ data: { success: true } })) },
}));

vi.mock('@/services/push/registerPushNotificationActionTypes', () => ({
  registerPushNotificationActionTypes: vi.fn(async () => undefined),
}));

vi.mock('@/services/push/pushDelegateBridge', () => ({
  setPushReplyJsReadyNative: vi.fn(async () => undefined),
}));

vi.mock('@/services/push/pushTapBridge', () => ({
  addPendingPushTapListener: vi.fn(async () => undefined),
  consumePendingPushTapNative: vi.fn(async () => undefined),
}));

describe('pushNotificationService.ensureTokenSentToBackend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    checkPermissionsMock.mockResolvedValue({ receive: 'prompt' });
    requestPermissionsMock.mockResolvedValue({ receive: 'granted' });
    registerMock.mockResolvedValue(undefined);
    getPlatformMock.mockReturnValue('ios');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('still requests permission when a no-prompt registration sync is in flight', async () => {
    let resolveFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    checkPermissionsMock.mockImplementation(async () => {
      await firstGate;
      return { receive: 'prompt' };
    });

    const { default: pushNotificationService } = await import('@/services/pushNotificationService');

    const silentSync = pushNotificationService.ensureTokenSentToBackend({ requestPermission: false });
    const permissionSync = pushNotificationService.ensureTokenSentToBackend({ requestPermission: true });

    resolveFirst?.();
    await Promise.all([silentSync, permissionSync]);

    expect(requestPermissionsMock).toHaveBeenCalledTimes(1);
    expect(registerMock).toHaveBeenCalledTimes(1);
  }, 10_000);

  it('does not re-request permission when only silent sync runs after an in-flight silent sync', async () => {
    let resolveFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    checkPermissionsMock.mockImplementation(async () => {
      await firstGate;
      return { receive: 'prompt' };
    });

    const { default: pushNotificationService } = await import('@/services/pushNotificationService');

    const first = pushNotificationService.ensureTokenSentToBackend({ requestPermission: false });
    const second = pushNotificationService.ensureTokenSentToBackend({ requestPermission: false });

    resolveFirst?.();
    await Promise.all([first, second]);

    expect(requestPermissionsMock).not.toHaveBeenCalled();
  });

  it('coalesces overlapping permission callers into one native prompt and registration', async () => {
    let resolvePermission: ((value: { receive: string }) => void) | undefined;
    requestPermissionsMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePermission = resolve;
        }),
    );

    checkPermissionsMock
      .mockResolvedValueOnce({ receive: 'prompt' })
      .mockResolvedValue({ receive: 'granted' });

    const { default: pushNotificationService } = await import('@/services/pushNotificationService');
    const calls = [
      pushNotificationService.ensureTokenSentToBackend({ requestPermission: true }),
      pushNotificationService.ensureTokenSentToBackend({ requestPermission: true }),
      pushNotificationService.ensureTokenSentToBackend({ requestPermission: true }),
    ];

    await vi.waitFor(() => expect(requestPermissionsMock).toHaveBeenCalledTimes(1));
    resolvePermission?.({ receive: 'granted' });
    await Promise.all(calls);

    expect(requestPermissionsMock).toHaveBeenCalledTimes(1);
    expect(registerMock).toHaveBeenCalledTimes(1);
  });

  it('contains a native permission failure so authentication cannot reject or retry-stack prompts', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    getPlatformMock.mockReturnValue('android');
    requestPermissionsMock.mockRejectedValue(new Error('permission activity disappeared'));

    const { default: pushNotificationService } = await import('@/services/pushNotificationService');

    await expect(
      Promise.all([
        pushNotificationService.ensureTokenSentToBackend({ requestPermission: true }),
        pushNotificationService.ensureTokenSentToBackend({ requestPermission: true }),
      ]),
    ).resolves.toEqual([undefined, undefined]);

    expect(requestPermissionsMock).toHaveBeenCalledTimes(1);
    expect(registerMock).not.toHaveBeenCalled();
    expect(blockLauncherIconChangesMock).toHaveBeenCalledTimes(1);
    expect(releaseLauncherIconBlockMock).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
