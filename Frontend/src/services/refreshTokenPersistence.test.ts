import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getRefreshTokenNativeMock = vi.fn<() => Promise<string | null>>();
const setRefreshTokenNativeMock = vi.fn<(token: string) => Promise<void>>();
const clearRefreshTokenNativeMock = vi.fn<() => Promise<void>>();
let nativePlatform = true;

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => nativePlatform },
}));

vi.mock('@/services/authBridge', () => ({
  getRefreshTokenNative: getRefreshTokenNativeMock,
  setRefreshTokenNative: setRefreshTokenNativeMock,
  clearRefreshTokenNative: clearRefreshTokenNativeMock,
}));

describe('native refresh-token persistence', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    nativePlatform = true;
    vi.clearAllMocks();
    getRefreshTokenNativeMock.mockResolvedValue(null);
    setRefreshTokenNativeMock.mockResolvedValue();
    clearRefreshTokenNativeMock.mockResolvedValue();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses secure storage instead of a stale WebView copy', async () => {
    storage.set('padelpulse_refresh_token', 'stale-webview-token');
    getRefreshTokenNativeMock.mockResolvedValue('secure-token');
    const { getRefreshTokenForRequest } = await import('@/services/refreshTokenPersistence');

    await expect(getRefreshTokenForRequest()).resolves.toBe('secure-token');
    expect(setRefreshTokenNativeMock).not.toHaveBeenCalled();
  });

  it('migrates a legacy WebView credential once when secure storage is empty', async () => {
    storage.set('padelpulse_refresh_token', 'legacy-token');
    getRefreshTokenNativeMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('legacy-token');
    const { getRefreshTokenForRequest } = await import('@/services/refreshTokenPersistence');

    await expect(getRefreshTokenForRequest()).resolves.toBe('legacy-token');
    expect(setRefreshTokenNativeMock).toHaveBeenCalledWith('legacy-token');
    expect(storage.has('padelpulse_refresh_token')).toBe(false);
  });

  it('keeps the legacy WebView credential when native migrate verify fails', async () => {
    storage.set('padelpulse_refresh_token', 'legacy-token');
    getRefreshTokenNativeMock.mockResolvedValue(null);
    const { getRefreshTokenForRequest } = await import('@/services/refreshTokenPersistence');

    await expect(getRefreshTokenForRequest()).resolves.toBe('legacy-token');
    expect(setRefreshTokenNativeMock).toHaveBeenCalledWith('legacy-token');
    expect(storage.has('padelpulse_refresh_token')).toBe(true);
  });

  it('does not expose a newly returned credential until secure persistence succeeds', async () => {
    setRefreshTokenNativeMock.mockRejectedValue(new Error('keychain unavailable'));
    const { persistRefreshBundle } = await import('@/services/refreshTokenPersistence');

    await expect(persistRefreshBundle('new-token', 'session-id')).rejects.toThrow(
      'keychain unavailable',
    );
    expect(storage.has('padelpulse_refresh_token')).toBe(false);
    expect(storage.has('padelpulse_current_session_id')).toBe(false);
  });

  it('reports secure-storage outages instead of claiming the credential is missing', async () => {
    getRefreshTokenNativeMock.mockRejectedValue(new Error('keystore temporarily unavailable'));
    const { getRefreshTokenForRequest } = await import('@/services/refreshTokenPersistence');

    await expect(getRefreshTokenForRequest()).rejects.toThrow('keystore temporarily unavailable');
    expect(setRefreshTokenNativeMock).not.toHaveBeenCalled();
  });

  it('removes legacy JavaScript refresh credentials when web uses HttpOnly cookies', async () => {
    nativePlatform = false;
    storage.set('padelpulse_refresh_token', 'legacy-web-token');
    const { getRefreshTokenForRequest } = await import('@/services/refreshTokenPersistence');

    await expect(getRefreshTokenForRequest()).resolves.toBeNull();
    expect(storage.has('padelpulse_refresh_token')).toBe(false);
  });

  it('persists one refresh request id until the response is durably applied', async () => {
    const {
      clearRefreshRequestId,
      getOrCreateRefreshRequestId,
    } = await import('@/services/refreshTokenPersistence');

    const first = await getOrCreateRefreshRequestId();
    const replay = await getOrCreateRefreshRequestId();
    expect(first).toMatch(/^[A-Za-z0-9._:-]{16,128}$/);
    expect(replay).toBe(first);

    clearRefreshRequestId();
    expect(await getOrCreateRefreshRequestId()).not.toBe(first);
  });

  it('derives the native replay id from the secure credential across local state loss', async () => {
    const {
      clearRefreshRequestId,
      getOrCreateRefreshRequestId,
    } = await import('@/services/refreshTokenPersistence');

    const first = await getOrCreateRefreshRequestId('secure-refresh-token');
    clearRefreshRequestId();
    const afterLocalStateLoss = await getOrCreateRefreshRequestId('secure-refresh-token');

    expect(first).toMatch(/^native-v1-[a-f0-9]{64}$/);
    expect(afterLocalStateLoss).toBe(first);
  });

  it('clears pending refresh replay state during logout cleanup', async () => {
    storage.set('padelpulse_refresh_request_id', 'refresh-request-pending-123');
    const { clearRefreshBundle } = await import('@/services/refreshTokenPersistence');

    await clearRefreshBundle();

    expect(storage.has('padelpulse_refresh_request_id')).toBe(false);
  });
});
