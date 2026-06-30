import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const persistOrder: string[] = [];

const persistRefreshBundleMock = vi.fn(async () => {
  persistOrder.push('persist');
});

const syncTokenToNativeMock = vi.fn(async () => {
  persistOrder.push('syncNative');
});

const updateProfileMock = vi.fn();

vi.mock('@/services/refreshTokenPersistence', () => ({
  clearRefreshBundle: vi.fn(async () => {
    persistOrder.push('clear');
  }),
  persistRefreshBundle: persistRefreshBundleMock,
  isWebHttpOnlyRefreshCookie: () => false,
}));

vi.mock('@/services/authBridge', () => ({
  syncTokenToNative: syncTokenToNativeMock,
  syncLogoutToNative: vi.fn(),
  syncApiBaseUrlToNative: vi.fn(async () => {}),
  syncBrandingLogoToNative: vi.fn(async () => {}),
}));

vi.mock('@/api/authRefresh', () => ({
  scheduleProactiveAccessRefresh: vi.fn(),
  clearProactiveAccessRefresh: vi.fn(),
}));

vi.mock('@/integrations/booktime/proactiveRefresh', () => ({
  clearAllProactiveBooktimeRefresh: vi.fn(),
}));

vi.mock('@/api', () => ({
  usersApi: { updateProfile: updateProfileMock },
  authApi: {},
  pushApi: { removeAllTokens: vi.fn() },
}));

vi.mock('@/i18n/config', () => ({
  default: { changeLanguage: vi.fn() },
}));

describe('useAuthStore.setAuth credential ordering', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    persistOrder.length = 0;
    persistRefreshBundleMock.mockClear();
    syncTokenToNativeMock.mockClear();
    updateProfileMock.mockReset();
    storage.clear();
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('persists refresh bundle before exposing authenticated state', async () => {
    const { useAuthStore } = await import('@/store/authStore');
    storage.set('auth_explicit_logout_at', '1782828960000');

    await useAuthStore.getState().setAuth(
      {
        id: 'user-1',
        firstName: 'Test',
        lastName: 'User',
        phone: '+10000000000',
        language: 'en-GB',
        timeFormat: '24h',
        weekStart: 'monday',
      } as never,
      'access-token',
      { refreshToken: 'refresh-token', currentSessionId: 'session-1' }
    );

    expect(persistOrder.indexOf('persist')).toBeLessThan(persistOrder.indexOf('syncNative'));
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(storage.get('auth_explicit_logout_at')).toBeUndefined();
    expect(persistRefreshBundleMock).toHaveBeenCalledWith('refresh-token', 'session-1');
    expect(syncTokenToNativeMock).toHaveBeenCalledWith('access-token');
  });

  it('does not accept refresh-delivered tokens while explicitly logged out', async () => {
    storage.set('auth_explicit_logout_at', '1782828960000');
    const { useAuthStore } = await import('@/store/authStore');

    useAuthStore.getState().setToken('late-refresh-token');

    expect(storage.get('token')).toBeUndefined();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('does not keep login waiting on profile preference normalization', async () => {
    const { useAuthStore } = await import('@/store/authStore');
    updateProfileMock.mockReturnValue(new Promise(() => {}));

    await useAuthStore.getState().setAuth(
      {
        id: 'user-1',
        firstName: 'Test',
        lastName: 'User',
        phone: '+10000000000',
      } as never,
      'access-token',
      { refreshToken: 'refresh-token', currentSessionId: 'session-1' }
    );

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(updateProfileMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1500);

    expect(updateProfileMock).toHaveBeenCalled();
  });
});
