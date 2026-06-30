import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const scheduleProactiveAccessRefreshMock = vi.fn();
const syncTokenToNativeMock = vi.fn();
const authStoreSetStateMock = vi.fn();
const authStoreGetStateMock = vi.fn(() => ({ isAuthenticated: false }));

vi.mock('@/api/authRefresh', () => ({
  scheduleProactiveAccessRefresh: scheduleProactiveAccessRefreshMock,
}));

vi.mock('@/services/authBridge', () => ({
  syncTokenToNative: syncTokenToNativeMock,
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: authStoreGetStateMock,
    setState: authStoreSetStateMock,
  },
}));

describe('auth persistence explicit logout handling', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.resetModules();
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
    scheduleProactiveAccessRefreshMock.mockClear();
    syncTokenToNativeMock.mockClear();
    authStoreSetStateMock.mockClear();
    authStoreGetStateMock.mockReturnValue({ isAuthenticated: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not restore an auth backup after explicit logout', async () => {
    const { markExplicitLogout } = await import('@/utils/authExplicitLogout');
    const { restoreAuthIfNeeded } = await import('@/utils/authPersistence');
    storage.set(
      'auth_backup',
      JSON.stringify({
        token: 'backup-token',
        user: JSON.stringify({ id: 'user-1' }),
        timestamp: Date.now(),
      }),
    );

    markExplicitLogout();
    restoreAuthIfNeeded();

    expect(storage.get('token')).toBeUndefined();
    expect(storage.get('user')).toBeUndefined();
    expect(storage.get('auth_backup')).toBeUndefined();
    expect(storage.get('auth_explicit_logout_at')).toBeDefined();
    expect(authStoreSetStateMock).not.toHaveBeenCalled();
    expect(scheduleProactiveAccessRefreshMock).not.toHaveBeenCalled();
  });

  it('does not create a fresh auth backup after explicit logout', async () => {
    const { markExplicitLogout } = await import('@/utils/authExplicitLogout');
    const { backupAuth } = await import('@/utils/authPersistence');
    storage.set('token', 'token-after-logout');
    storage.set('user', JSON.stringify({ id: 'user-1' }));
    storage.set('auth_backup', 'old-backup');

    markExplicitLogout();
    backupAuth();

    expect(storage.get('auth_backup')).toBeUndefined();
  });

  it('still restores a valid backup when logout was not explicit', async () => {
    const { restoreAuthIfNeeded } = await import('@/utils/authPersistence');
    storage.set(
      'auth_backup',
      JSON.stringify({
        token: 'backup-token',
        user: JSON.stringify({ id: 'user-1' }),
        timestamp: Date.now(),
      }),
    );

    restoreAuthIfNeeded();

    expect(storage.get('token')).toBe('backup-token');
    expect(storage.get('user')).toBe(JSON.stringify({ id: 'user-1' }));
    expect(authStoreSetStateMock).toHaveBeenCalledWith({
      user: { id: 'user-1' },
      token: 'backup-token',
      isAuthenticated: true,
    });
    expect(syncTokenToNativeMock).toHaveBeenCalledWith('backup-token');
    expect(scheduleProactiveAccessRefreshMock).toHaveBeenCalledWith('backup-token');
  });
});
