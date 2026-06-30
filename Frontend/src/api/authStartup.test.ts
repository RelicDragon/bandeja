import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ token: null })),
    setState: vi.fn(),
  },
}));

function jwtWithExp(expMs: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(expMs / 1000) })).toString('base64url');
  return `header.${payload}.signature`;
}

const baseNow = Date.UTC(2026, 5, 30, 12, 0, 0);

function depsFor(token: string | null, overrides?: {
  hasRefreshCredential?: () => Promise<boolean>;
  refreshAccessToken?: () => Promise<string | null>;
  consumeRefreshClearedCredentials?: () => boolean;
  consumeRefreshFailureCode?: () => string | null;
  hasStoredUserCandidate?: () => boolean;
  hasExplicitLogoutMarker?: () => boolean;
}) {
  return {
    getAccessToken: vi.fn(() => token),
    hasRefreshCredential: vi.fn(overrides?.hasRefreshCredential ?? (async () => true)),
    refreshAccessToken: vi.fn(overrides?.refreshAccessToken ?? (async () => null)),
    scheduleRefresh: vi.fn(),
    clearLocalAuth: vi.fn(async () => {}),
    suspendAccessToken: vi.fn(async () => {}),
    hasStoredUserCandidate: vi.fn(overrides?.hasStoredUserCandidate ?? (() => false)),
    hasExplicitLogoutMarker: vi.fn(overrides?.hasExplicitLogoutMarker ?? (() => false)),
    consumeRefreshClearedCredentials: vi.fn(overrides?.consumeRefreshClearedCredentials ?? (() => false)),
    consumeRefreshFailureCode: vi.fn(overrides?.consumeRefreshFailureCode ?? (() => null)),
    now: vi.fn(() => baseNow),
    log: vi.fn(),
  };
}

describe('auth startup verifier', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('continues anonymously when no token is stored', async () => {
    const { settleStoredAuthBeforeBootstrap } = await import('@/api/authStartup');
    const deps = depsFor(null);

    const result = await settleStoredAuthBeforeBootstrap({ deps });

    expect(result.status).toBe('anonymous');
    expect(result.tokenState).toBe('missing');
    expect(deps.refreshAccessToken).not.toHaveBeenCalled();
    expect(deps.clearLocalAuth).not.toHaveBeenCalled();
  });

  it('refreshes a missing access token when a saved user and refresh session exist', async () => {
    const { settleStoredAuthBeforeBootstrap } = await import('@/api/authStartup');
    const freshToken = jwtWithExp(baseNow + 10 * 60 * 1000);
    const deps = depsFor(null, {
      hasStoredUserCandidate: () => true,
      refreshAccessToken: async () => freshToken,
    });

    const result = await settleStoredAuthBeforeBootstrap({ deps });

    expect(result.status).toBe('refreshed');
    expect(result.tokenState).toBe('missing');
    expect(deps.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(deps.scheduleRefresh).toHaveBeenCalledWith(freshToken);
  });

  it('does not refresh missing access token after explicit logout', async () => {
    const { settleStoredAuthBeforeBootstrap } = await import('@/api/authStartup');
    const freshToken = jwtWithExp(baseNow + 10 * 60 * 1000);
    const deps = depsFor(null, {
      hasStoredUserCandidate: () => true,
      hasExplicitLogoutMarker: () => true,
      refreshAccessToken: async () => freshToken,
    });

    const result = await settleStoredAuthBeforeBootstrap({ deps });

    expect(result.status).toBe('cleared');
    expect(result.tokenState).toBe('missing');
    expect(result.reason).toBe('explicit_logout');
    expect(deps.clearLocalAuth).toHaveBeenCalledWith('explicit_logout');
    expect(deps.refreshAccessToken).not.toHaveBeenCalled();
    expect(deps.scheduleRefresh).not.toHaveBeenCalled();
  });

  it('accepts a token that is valid beyond the refresh leeway', async () => {
    const { settleStoredAuthBeforeBootstrap } = await import('@/api/authStartup');
    const token = jwtWithExp(baseNow + 5 * 60 * 1000);
    const deps = depsFor(token);

    const result = await settleStoredAuthBeforeBootstrap({ deps });

    expect(result.status).toBe('valid');
    expect(result.tokenState).toBe('valid');
    expect(deps.scheduleRefresh).toHaveBeenCalledWith(token);
    expect(deps.refreshAccessToken).not.toHaveBeenCalled();
  });

  it('refreshes a near-expiry token before releasing startup', async () => {
    const { settleStoredAuthBeforeBootstrap } = await import('@/api/authStartup');
    const staleToken = jwtWithExp(baseNow + 30 * 1000);
    const freshToken = jwtWithExp(baseNow + 10 * 60 * 1000);
    const deps = depsFor(staleToken, {
      refreshAccessToken: async () => freshToken,
    });

    const result = await settleStoredAuthBeforeBootstrap({ deps });

    expect(result.status).toBe('refreshed');
    expect(result.tokenState).toBe('near_expiry');
    expect(deps.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(deps.scheduleRefresh).toHaveBeenCalledWith(freshToken);
  });

  it('refreshes an expired token when refresh credentials exist', async () => {
    const { settleStoredAuthBeforeBootstrap } = await import('@/api/authStartup');
    const expiredToken = jwtWithExp(baseNow - 1000);
    const freshToken = jwtWithExp(baseNow + 10 * 60 * 1000);
    const deps = depsFor(expiredToken, {
      refreshAccessToken: async () => freshToken,
    });

    const result = await settleStoredAuthBeforeBootstrap({ deps });

    expect(result.status).toBe('refreshed');
    expect(result.tokenState).toBe('expired');
    expect(deps.clearLocalAuth).not.toHaveBeenCalled();
  });

  it('clears malformed local auth without attempting refresh', async () => {
    const { settleStoredAuthBeforeBootstrap } = await import('@/api/authStartup');
    const deps = depsFor('not-a-jwt');

    const result = await settleStoredAuthBeforeBootstrap({ deps });

    expect(result.status).toBe('cleared');
    expect(result.tokenState).toBe('invalid_shape');
    expect(result.reason).toBe('invalid_access_token');
    expect(deps.clearLocalAuth).toHaveBeenCalledWith('invalid_access_token');
    expect(deps.refreshAccessToken).not.toHaveBeenCalled();
  });

  it('clears expired local auth when no refresh credential exists', async () => {
    const { settleStoredAuthBeforeBootstrap } = await import('@/api/authStartup');
    const deps = depsFor(jwtWithExp(baseNow - 1000), {
      hasRefreshCredential: async () => false,
    });

    const result = await settleStoredAuthBeforeBootstrap({ deps });

    expect(result.status).toBe('cleared');
    expect(result.reason).toBe('missing_refresh_credential');
    expect(deps.clearLocalAuth).toHaveBeenCalledWith('missing_refresh_credential');
    expect(deps.refreshAccessToken).not.toHaveBeenCalled();
  });

  it('clears local auth when refresh is hard-rejected', async () => {
    const { settleStoredAuthBeforeBootstrap } = await import('@/api/authStartup');
    const deps = depsFor(jwtWithExp(baseNow - 1000), {
      refreshAccessToken: async () => null,
      consumeRefreshClearedCredentials: () => true,
      consumeRefreshFailureCode: () => 'auth.refreshExpired',
    });

    const result = await settleStoredAuthBeforeBootstrap({ deps });

    expect(result.status).toBe('cleared');
    expect(result.reason).toBe('auth.refreshExpired');
    expect(deps.clearLocalAuth).toHaveBeenCalledWith('auth.refreshExpired');
  });

  it('suspends a stale access token when refresh exceeds the startup timeout', async () => {
    vi.useFakeTimers();
    const { settleStoredAuthBeforeBootstrap } = await import('@/api/authStartup');
    const deps = depsFor(jwtWithExp(baseNow - 1000), {
      refreshAccessToken: () => new Promise(() => {}),
    });

    const pending = settleStoredAuthBeforeBootstrap({ deps, timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    const result = await pending;

    expect(result.status).toBe('degraded');
    expect(result.reason).toBe('refresh_timeout_access_suspended');
    expect(deps.clearLocalAuth).not.toHaveBeenCalled();
    expect(deps.suspendAccessToken).toHaveBeenCalledWith('refresh_timeout');
  });

  it('does not suspend anything when missing-token refresh times out', async () => {
    vi.useFakeTimers();
    const { settleStoredAuthBeforeBootstrap } = await import('@/api/authStartup');
    const deps = depsFor(null, {
      hasStoredUserCandidate: () => true,
      refreshAccessToken: () => new Promise(() => {}),
    });

    const pending = settleStoredAuthBeforeBootstrap({ deps, timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    const result = await pending;

    expect(result.status).toBe('degraded');
    expect(result.reason).toBe('refresh_timeout');
    expect(deps.suspendAccessToken).not.toHaveBeenCalled();
    expect(deps.clearLocalAuth).not.toHaveBeenCalled();
  });
});
