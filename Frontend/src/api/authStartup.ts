import {
  ACCESS_LEEWAY_MS,
  clearProactiveAccessRefresh,
  consumeLastRefreshRunFailureCode,
  consumeRefreshRunClearedCredentials,
  decodeJwtExpMs,
  refreshAccessTokenSingleFlight,
  scheduleProactiveAccessRefresh,
} from '@/api/authRefresh';
import { bumpApiAuthCredentialGeneration } from '@/api/apiAuthCredentialGeneration';
import {
  clearRefreshBundle,
  getRefreshTokenForRequest,
  isWebHttpOnlyRefreshCookie,
} from '@/services/refreshTokenPersistence';
import { syncLogoutToNative } from '@/services/authBridge';
import { useAuthStore } from '@/store/authStore';
import { hasExplicitLogoutMarker } from '@/utils/authExplicitLogout';

export type StoredAccessTokenState =
  | 'missing'
  | 'valid'
  | 'near_expiry'
  | 'expired'
  | 'invalid_shape';

export type AuthStartupStatus =
  | 'anonymous'
  | 'valid'
  | 'refreshed'
  | 'cleared'
  | 'degraded';

export type AuthStartupResult = {
  status: AuthStartupStatus;
  tokenState: StoredAccessTokenState;
  reason?: string;
  elapsedMs: number;
};

type AuthStartupDeps = {
  getAccessToken: () => string | null;
  hasRefreshCredential: () => Promise<boolean>;
  refreshAccessToken: () => Promise<string | null>;
  scheduleRefresh: (token: string) => void;
  clearLocalAuth: (reason: string) => Promise<void>;
  suspendAccessToken: (reason: string) => Promise<void>;
  hasStoredUserCandidate: () => boolean;
  hasExplicitLogoutMarker: () => boolean;
  consumeRefreshClearedCredentials: () => boolean;
  consumeRefreshFailureCode: () => string | null;
  now: () => number;
  log: (result: AuthStartupResult) => void;
};

export const AUTH_STARTUP_DEFAULT_TIMEOUT_MS = 6000;

const HARD_STARTUP_REFRESH_CODES = new Set([
  'auth.refreshInvalid',
  'auth.refreshExpired',
  'auth.refreshReused',
  'auth.refreshTokenRequired',
  'auth.userInactive',
  'auth.userNotFound',
  'auth.clientUpgradeRequired',
]);

function readAccessTokenFromStoreOrStorage(): string | null {
  const storeToken = useAuthStore.getState().token;
  if (storeToken) return storeToken;
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
}

function hasStoredUserCandidate(): boolean {
  if (useAuthStore.getState().user) return true;
  try {
    return !!localStorage.getItem('user');
  } catch {
    return false;
  }
}

async function defaultHasRefreshCredential(): Promise<boolean> {
  const refreshToken = (await getRefreshTokenForRequest())?.trim() ?? '';
  return !!refreshToken || isWebHttpOnlyRefreshCookie();
}

function removeLocalAuthStorage(): void {
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('auth_backup');
  } catch {
    /* no-op */
  }
}

async function clearLocalAuthCandidate(reason: string): Promise<void> {
  bumpApiAuthCredentialGeneration();
  clearProactiveAccessRefresh();
  await clearRefreshBundle();
  removeLocalAuthStorage();
  useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
  syncLogoutToNative();
  try {
    const { clearWidgetNextGamesCache } = await import('@/services/widgetNextGamesSync');
    await clearWidgetNextGamesCache();
  } catch (e) {
    console.warn('[auth:startup] widget cache clear failed', e);
  }
  bumpApiAuthCredentialGeneration();
  console.info('[auth:startup] local auth cleared', { reason });
}

async function suspendAccessTokenCandidate(reason: string): Promise<void> {
  bumpApiAuthCredentialGeneration();
  clearProactiveAccessRefresh();
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('auth_backup');
  } catch {
    /* no-op */
  }
  useAuthStore.setState({ token: null, isAuthenticated: false });
  syncLogoutToNative();
  try {
    const { clearWidgetNextGamesCache } = await import('@/services/widgetNextGamesSync');
    await clearWidgetNextGamesCache();
  } catch (e) {
    console.warn('[auth:startup] widget cache clear failed', e);
  }
  bumpApiAuthCredentialGeneration();
  console.info('[auth:startup] access token suspended', { reason });
}

function logAuthStartupResult(result: AuthStartupResult): void {
  console.info('[auth:startup] settled stored credential', result);
}

const defaultDeps: AuthStartupDeps = {
  getAccessToken: readAccessTokenFromStoreOrStorage,
  hasRefreshCredential: defaultHasRefreshCredential,
  refreshAccessToken: refreshAccessTokenSingleFlight,
  scheduleRefresh: scheduleProactiveAccessRefresh,
  clearLocalAuth: clearLocalAuthCandidate,
  suspendAccessToken: suspendAccessTokenCandidate,
  hasStoredUserCandidate,
  hasExplicitLogoutMarker,
  consumeRefreshClearedCredentials: consumeRefreshRunClearedCredentials,
  consumeRefreshFailureCode: consumeLastRefreshRunFailureCode,
  now: () => Date.now(),
  log: logAuthStartupResult,
};

export function classifyStoredAccessToken(
  token: string | null | undefined,
  nowMs = Date.now(),
  leewayMs = ACCESS_LEEWAY_MS,
): StoredAccessTokenState {
  if (!token) return 'missing';
  const expMs = decodeJwtExpMs(token);
  if (!expMs) return 'invalid_shape';
  const msUntilExp = expMs - nowMs;
  if (msUntilExp <= 0) return 'expired';
  if (msUntilExp <= leewayMs) return 'near_expiry';
  return 'valid';
}

function isHardStartupRefreshReject(code: string | null): boolean {
  return !!code && HARD_STARTUP_REFRESH_CODES.has(code);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<{ type: 'resolved'; value: T } | { type: 'timeout' }> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise.then((value) => ({ type: 'resolved' as const, value })),
      new Promise<{ type: 'timeout' }>((resolve) => {
        timeout = setTimeout(() => resolve({ type: 'timeout' }), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function settleStoredAuthBeforeBootstrap(opts?: {
  timeoutMs?: number;
  deps?: Partial<AuthStartupDeps>;
}): Promise<AuthStartupResult> {
  const deps = { ...defaultDeps, ...opts?.deps };
  const timeoutMs = opts?.timeoutMs ?? AUTH_STARTUP_DEFAULT_TIMEOUT_MS;
  const startedAt = deps.now();
  const result = async (
    status: AuthStartupStatus,
    tokenState: StoredAccessTokenState,
    reason?: string,
  ): Promise<AuthStartupResult> => {
    const settled: AuthStartupResult = {
      status,
      tokenState,
      reason,
      elapsedMs: Math.max(0, deps.now() - startedAt),
    };
    deps.log(settled);
    return settled;
  };

  try {
    const token = deps.getAccessToken();
    const tokenState = classifyStoredAccessToken(token, deps.now());

    if (deps.hasExplicitLogoutMarker()) {
      await deps.clearLocalAuth('explicit_logout');
      return result('cleared', tokenState, 'explicit_logout');
    }

    if (tokenState === 'missing') {
      if (!deps.hasStoredUserCandidate()) {
        return result('anonymous', tokenState);
      }

      const canRefresh = await deps.hasRefreshCredential();
      if (!canRefresh) {
        await deps.clearLocalAuth('missing_refresh_credential');
        return result('cleared', tokenState, 'missing_refresh_credential');
      }

      const refresh = await withTimeout(deps.refreshAccessToken(), timeoutMs);
      if (refresh.type === 'timeout') {
        return result('degraded', tokenState, 'refresh_timeout');
      }

      if (refresh.value) {
        deps.scheduleRefresh(refresh.value);
        return result('refreshed', tokenState);
      }

      const failureCode = deps.consumeRefreshFailureCode();
      const refreshClearedCredentials = deps.consumeRefreshClearedCredentials();
      if (refreshClearedCredentials || isHardStartupRefreshReject(failureCode)) {
        await deps.clearLocalAuth(failureCode ?? 'refresh_rejected');
        return result('cleared', tokenState, failureCode ?? 'refresh_rejected');
      }

      return result('degraded', tokenState, failureCode ?? 'refresh_unavailable');
    }

    if (!token || tokenState === 'invalid_shape') {
      await deps.clearLocalAuth('invalid_access_token');
      return result('cleared', tokenState, 'invalid_access_token');
    }

    if (tokenState === 'valid') {
      deps.scheduleRefresh(token);
      return result('valid', tokenState);
    }

    const canRefresh = await deps.hasRefreshCredential();
    if (!canRefresh) {
      await deps.clearLocalAuth('missing_refresh_credential');
      return result('cleared', tokenState, 'missing_refresh_credential');
    }

    const refresh = await withTimeout(deps.refreshAccessToken(), timeoutMs);
    if (refresh.type === 'timeout') {
      await deps.suspendAccessToken('refresh_timeout');
      return result('degraded', tokenState, 'refresh_timeout_access_suspended');
    }

    if (refresh.value) {
      deps.scheduleRefresh(refresh.value);
      return result('refreshed', tokenState);
    }

    const failureCode = deps.consumeRefreshFailureCode();
    const refreshClearedCredentials = deps.consumeRefreshClearedCredentials();
    if (refreshClearedCredentials || isHardStartupRefreshReject(failureCode)) {
      await deps.clearLocalAuth(failureCode ?? 'refresh_rejected');
      return result('cleared', tokenState, failureCode ?? 'refresh_rejected');
    }

    return result('degraded', tokenState, failureCode ?? 'refresh_unavailable');
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'startup_auth_error';
    return result('degraded', classifyStoredAccessToken(deps.getAccessToken(), deps.now()), reason);
  }
}
