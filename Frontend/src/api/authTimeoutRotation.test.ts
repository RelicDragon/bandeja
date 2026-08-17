import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const applyAccessTokenMock = vi.fn();
const persistRefreshBundleMock = vi.fn(async () => {});

let resolveRefreshPost: ((value: unknown) => void) | null = null;
let lastRefreshRequestConfig: { headers?: Record<string, string> } | null = null;

vi.mock('axios', () => {
  const refreshClient = {
    interceptors: { request: { use: vi.fn() } },
    post: vi.fn(
      (_url: string, _body: unknown, config?: { headers?: Record<string, string> }) =>
        new Promise((resolve) => {
          lastRefreshRequestConfig = config ?? null;
          resolveRefreshPost = resolve;
        }),
    ),
  };
  return {
    default: {
      create: vi.fn(() => refreshClient),
      isAxiosError: vi.fn(() => false),
    },
    isAxiosError: vi.fn(() => false),
  };
});

vi.mock('@/api/httpClient', () => ({ api: { request: vi.fn() } }));
vi.mock('@/api/apiBaseUrl', () => ({ getApiAxiosBaseURL: () => 'https://example.test/api' }));
vi.mock('@/utils/clientAppVersion', () => ({ getClientAppSemver: () => '1.0.0' }));
vi.mock('@/utils/capacitor', () => ({ isCapacitor: () => false }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'web' } }));
vi.mock('@/utils/authExplicitLogout', () => ({ hasExplicitLogoutMarker: () => false }));
vi.mock('@/services/authBridge', () => ({
  clearAccessTokenNative: vi.fn(async () => {}),
  syncLogoutToNative: vi.fn(async () => {}),
}));
vi.mock('@/store/authAccessSink', () => ({
  applyAccessTokenFromRefresh: applyAccessTokenMock,
}));
vi.mock('@/services/refreshTokenPersistence', () => ({
  clearRefreshBundle: vi.fn(async () => {}),
  clearRefreshRequestId: vi.fn(),
  getRefreshTokenForRequest: vi.fn(async () => 'stable-refresh-token'),
  getOrCreateRefreshRequestId: vi.fn(() => 'refresh-request-timeout-123'),
  isWebHttpOnlyRefreshCookie: () => false,
  persistRefreshBundle: persistRefreshBundleMock,
  persistSessionIdOnly: vi.fn(),
}));
vi.mock('@/store/authStore', () => ({
  useAuthStore: { getState: vi.fn(() => ({ token: null })), setState: vi.fn() },
}));

function jwtWithExp(expMs: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(expMs / 1000) })).toString('base64url');
  return `header.${payload}.signature`;
}

describe('cold-start refresh timeout', () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    resolveRefreshPost = null;
    lastRefreshRequestConfig = null;
    vi.unstubAllGlobals();
  });

  it('accepts credentials from a refresh that completes after the startup UI timeout', async () => {
    vi.useFakeTimers();
    const now = Date.UTC(2026, 7, 13, 12, 0, 0);
    vi.setSystemTime(now);

    const { refreshAccessTokenSingleFlight } = await import('@/api/authRefresh');
    const { settleStoredAuthBeforeBootstrap } = await import('@/api/authStartup');

    const pending = settleStoredAuthBeforeBootstrap({
      timeoutMs: 100,
      deps: {
        getAccessToken: () => jwtWithExp(now - 1_000),
        hasRefreshCredential: async () => true,
        refreshAccessToken: refreshAccessTokenSingleFlight,
        scheduleRefresh: vi.fn(),
        clearLocalAuth: vi.fn(async () => {}),
        hasStoredUserCandidate: () => true,
        hasExplicitLogoutMarker: () => false,
        consumeRefreshClearedCredentials: () => false,
        consumeRefreshFailureCode: () => null,
        now: () => Date.now(),
        log: vi.fn(),
      },
    });

    await vi.advanceTimersByTimeAsync(100);
    await expect(pending).resolves.toMatchObject({
      status: 'degraded',
      reason: 'refresh_timeout',
    });
    expect(lastRefreshRequestConfig?.headers?.['X-Refresh-Request-Id']).toMatch(
      /^[A-Za-z0-9._:-]{16,128}$/,
    );

    const freshAccessToken = jwtWithExp(now + 30 * 60 * 1_000);
    resolveRefreshPost?.({
      data: {
        success: true,
        data: {
          token: freshAccessToken,
          refreshToken: 'stable-refresh-token',
          currentSessionId: 'session-id',
        },
      },
    });
    await vi.runAllTimersAsync();

    expect(applyAccessTokenMock).toHaveBeenCalledWith(freshAccessToken);
    expect(persistRefreshBundleMock).toHaveBeenCalledWith(
      'stable-refresh-token',
      'session-id',
    );
  });
});
