import {
  ACCESS_LEEWAY_MS,
  clearProactiveAccessRefresh,
  consumeLastRefreshRunFailureCode,
  consumeRefreshRunClearedCredentials,
  decodeJwtExpMs,
  refreshAccessTokenSingleFlight,
  scheduleProactiveAccessRefresh,
} from '@/api/authRefresh';
import { isHardRefreshReject } from '@/api/authRefreshCodes';
import { bumpApiAuthCredentialGeneration } from '@/api/apiAuthCredentialGeneration';
import {
  clearRefreshBundle,
  getRefreshTokenForRequest,
  isWebHttpOnlyRefreshCookie,
} from '@/services/refreshTokenPersistence';
import { syncLogoutToNative } from '@/services/authBridge';
import { useAuthStore } from '@/store/authStore';
import { hasExplicitLogoutMarker } from '@/utils/authExplicitLogout';
import { runForegroundAuthSettle } from '@/api/authForegroundSettle';

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
  hasStoredUserCandidate: () => boolean;
  hasExplicitLogoutMarker: () => boolean;
  consumeRefreshClearedCredentials: () => boolean;
  consumeRefreshFailureCode: () => string | null;
  now: () => number;
  log: (result: AuthStartupResult) => void;
};

/** 0 waits for the refresh client itself (20s). A short UI timeout must never clear the session. */
export const AUTH_STARTUP_DEFAULT_TIMEOUT_MS = 0;

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
  const { default: pushNotificationService } = await import('@/services/pushNotificationService');
  pushNotificationService.resetForLogout();
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

function logAuthStartupResult(result: AuthStartupResult): void {
  console.info('[auth:startup] settled stored credential', result);
}

const defaultDeps: AuthStartupDeps = {
  getAccessToken: readAccessTokenFromStoreOrStorage,
  hasRefreshCredential: defaultHasRefreshCredential,
  refreshAccessToken: refreshAccessTokenSingleFlight,
  scheduleRefresh: scheduleProactiveAccessRefresh,
  clearLocalAuth: clearLocalAuthCandidate,
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

export function hasUsableAccessToken(
  token: string | null | undefined,
  nowMs = Date.now(),
  leewayMs = ACCESS_LEEWAY_MS,
): boolean {
  const state = classifyStoredAccessToken(token, nowMs, leewayMs);
  return state === 'valid' || state === 'near_expiry';
}

export function canStartAuthenticatedNetwork(input: {
  isAuthenticated: boolean;
  isInitializing: boolean;
  token: string | null;
}): boolean {
  return input.isAuthenticated && !input.isInitializing && hasUsableAccessToken(input.token);
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

async function awaitRefresh(
  refresh: Promise<string | null>,
  timeoutMs: number,
): Promise<string | null | 'timeout'> {
  if (timeoutMs <= 0) return refresh;
  const raced = await withTimeout(refresh, timeoutMs);
  return raced.type === 'timeout' ? 'timeout' : raced.value;
}

async function recoverPersistedSession(
  deps: AuthStartupDeps,
  tokenState: StoredAccessTokenState,
  timeoutMs: number,
  result: (
    status: AuthStartupStatus,
    tokenState: StoredAccessTokenState,
    reason?: string,
  ) => Promise<AuthStartupResult>,
): Promise<AuthStartupResult> {
  const missingReason =
    tokenState === 'invalid_shape' ? 'invalid_access_token' : 'missing_refresh_credential';
  if (!(await deps.hasRefreshCredential())) {
    await deps.clearLocalAuth(missingReason);
    return result('cleared', tokenState, missingReason);
  }

  const refreshed = await awaitRefresh(deps.refreshAccessToken(), timeoutMs);
  if (refreshed === 'timeout') {
    return result('degraded', tokenState, 'refresh_timeout');
  }
  if (refreshed) {
    deps.scheduleRefresh(refreshed);
    return result('refreshed', tokenState);
  }

  const failureCode = deps.consumeRefreshFailureCode();
  if (deps.consumeRefreshClearedCredentials() || isHardRefreshReject(failureCode)) {
    await deps.clearLocalAuth(failureCode ?? 'refresh_rejected');
    return result('cleared', tokenState, failureCode ?? 'refresh_rejected');
  }
  return result('degraded', tokenState, failureCode ?? 'refresh_unavailable');
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

    if (tokenState === 'valid' && token) {
      // LS may have a usable JWT while the store token was cleared (e.g. mid-link reload).
      if (!useAuthStore.getState().token) {
        useAuthStore.getState().setToken(token);
      }
      deps.scheduleRefresh(token);
      return result('valid', tokenState);
    }

    if (tokenState === 'missing' && !deps.hasStoredUserCandidate()) {
      return result('anonymous', tokenState);
    }

    return recoverPersistedSession(deps, tokenState, timeoutMs, result);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'startup_auth_error';
    return result('degraded', classifyStoredAccessToken(deps.getAccessToken(), deps.now()), reason);
  }
}

export function settleStoredAuthOnForeground(): Promise<AuthStartupResult> {
  return runForegroundAuthSettle(() => settleStoredAuthBeforeBootstrap());
}
