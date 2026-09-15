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

function accessJwt(expMs = Date.now() + 30 * 60 * 1000): string {
  const payload = btoa(JSON.stringify({ typ: 'access', exp: Math.floor(expMs / 1000) }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `hdr.${payload}.sig`;
}

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
        token: accessJwt(),
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

  it('still restores a valid access JWT backup when logout was not explicit', async () => {
    const token = accessJwt();
    const { restoreAuthIfNeeded } = await import('@/utils/authPersistence');
    storage.set(
      'auth_backup',
      JSON.stringify({
        token,
        user: JSON.stringify({ id: 'user-1' }),
        timestamp: Date.now(),
      }),
    );

    restoreAuthIfNeeded();

    expect(storage.get('token')).toBe(token);
    expect(storage.get('user')).toBe(JSON.stringify({ id: 'user-1' }));
    expect(authStoreSetStateMock).toHaveBeenCalledWith({
      user: { id: 'user-1' },
      token,
      isAuthenticated: true,
    });
    expect(syncTokenToNativeMock).toHaveBeenCalledWith(token);
    expect(scheduleProactiveAccessRefreshMock).toHaveBeenCalledWith(token);
  });

  it('does not restore a legacy long-lived JWT backup', async () => {
    const { restoreAuthIfNeeded } = await import('@/utils/authPersistence');
    storage.set(
      'auth_backup',
      JSON.stringify({
        token: 'legacy-long-lived-token',
        user: JSON.stringify({ id: 'user-1' }),
        timestamp: Date.now(),
      }),
    );

    restoreAuthIfNeeded();

    expect(storage.get('token')).toBeUndefined();
    expect(storage.get('auth_backup')).toBeUndefined();
    expect(authStoreSetStateMock).not.toHaveBeenCalled();
  });
});
