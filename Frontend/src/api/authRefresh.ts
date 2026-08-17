import axios, { AxiosError } from 'axios';
import { getApiAxiosBaseURL } from '@/api/apiBaseUrl';
import { api } from '@/api/httpClient';
import { getClientAppSemver } from '@/utils/clientAppVersion';
import { isCapacitor } from '@/utils/capacitor';
import { Capacitor } from '@capacitor/core';
import { applyAccessTokenFromRefresh } from '@/store/authAccessSink';
import {
  clearRefreshBundle,
  clearRefreshRequestId,
  getRefreshTokenForRequest,
  getOrCreateRefreshRequestId,
  isWebHttpOnlyRefreshCookie,
  persistRefreshBundle,
  persistSessionIdOnly,
} from '@/services/refreshTokenPersistence';
import { handleApiUnauthorizedIfNeeded } from '@/api/handleApiUnauthorized';
import { awaitAuthForegroundSettle } from '@/api/authForegroundSettle';
import {
  getApiAuthCredentialGeneration,
  isStaleApiAuthCredentialGeneration,
} from '@/api/apiAuthCredentialGeneration';
import {
  AUTH_CODES_SKIP_REFRESH,
  isHardRefreshReject,
  isRetryableRefreshCode,
} from '@/api/authRefreshCodes';
import { hasExplicitLogoutMarker } from '@/utils/authExplicitLogout';

export { AUTH_CODES_SKIP_REFRESH } from '@/api/authRefreshCodes';

const AUTH_CHANNEL = 'padelpulse-auth-v2';
const AUTH_SYNC_TYPE = 'padelpulse-auth-sync-v2';
const CROSS_TAB_REFRESH_LOCK = 'padelpulse-auth-refresh';
const REFRESH_ATTEMPTS = 3;

const BROADCAST_TAB_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

let lastPeerBroadcastRefreshAt = 0;
const PEER_BROADCAST_REFRESH_COOLDOWN_MS = 450;

const MIN_GLOBAL_REFRESH_INTERVAL_MS = 4000;
let lastSuccessfulRefreshAt = 0;
let lastSuccessfulRefreshToken: string | null = null;

function readStoredAccessToken(): string | null {
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
}

export const ACCESS_LEEWAY_MS = ((): number => {
  const raw = import.meta.env.VITE_ACCESS_REFRESH_LEEWAY_MS as unknown;
  if (typeof raw === 'number' && raw > 0) return raw;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 120_000;
})();

function clientPlatformHeader(): string {
  if (!isCapacitor()) return 'web';
  const p = Capacitor.getPlatform();
  if (p === 'ios') return 'ios';
  if (p === 'android') return 'android';
  return 'unknown';
}

const refreshClient = axios.create({
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  timeout: 20_000,
  withCredentials: !isCapacitor(),
});

refreshClient.interceptors.request.use((config) => {
  config.baseURL = getApiAxiosBaseURL();
  config.headers['X-Client-Version'] = getClientAppSemver();
  config.headers['X-Client-Platform'] = clientPlatformHeader();
  return config;
});

let refreshPromise: Promise<string | null> | null = null;
let proactiveTimer: ReturnType<typeof setTimeout> | null = null;
let authBroadcastChannel: BroadcastChannel | null = null;
const retriedRequestAfterRefresh = new WeakSet<object>();
let lastRefreshRunClearedCredentials = false;
let lastRefreshRunFailureCode: string | null = null;

type RefreshFailure = Error & { refreshCode?: string };

function refreshFailure(code: string): never {
  const err = new Error('refresh failed') as RefreshFailure;
  err.refreshCode = code;
  throw err;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function consumeRefreshRunClearedCredentials(): boolean {
  const v = lastRefreshRunClearedCredentials;
  lastRefreshRunClearedCredentials = false;
  return v;
}

export function consumeLastRefreshRunFailureCode(): string | null {
  const v = lastRefreshRunFailureCode;
  lastRefreshRunFailureCode = null;
  return v;
}

function markDurableRefreshCleared(): void {
  clearRefreshRequestId();
  lastRefreshRunClearedCredentials = true;
  lastSuccessfulRefreshAt = 0;
  lastSuccessfulRefreshToken = null;
}

export function invalidateCachedAccessToken(token?: string | null): void {
  if (!token || lastSuccessfulRefreshToken !== token) return;
  lastSuccessfulRefreshAt = 0;
  lastSuccessfulRefreshToken = null;
}

export function decodeJwtExpMs(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { exp?: number };
    if (typeof payload.exp !== 'number') return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

function broadcastAuthRefreshSignal(currentSessionId?: string) {
  try {
    if (typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel(AUTH_CHANNEL);
    const msg: { type: string; sourceId: string; currentSessionId?: string } = {
      type: AUTH_SYNC_TYPE,
      sourceId: BROADCAST_TAB_ID,
    };
    if (currentSessionId) msg.currentSessionId = currentSessionId;
    bc.postMessage(msg);
    bc.close();
  } catch {
    /* no-op */
  }
}

export function ensureAuthBroadcastListener(): void {
  if (typeof window === 'undefined' || authBroadcastChannel) return;
  if (typeof BroadcastChannel === 'undefined') return;
  authBroadcastChannel = new BroadcastChannel(AUTH_CHANNEL);
  authBroadcastChannel.onmessage = (ev) => {
    const d = ev.data as {
      type?: string;
      sourceId?: string;
      currentSessionId?: string;
    };
    if (d?.type !== AUTH_SYNC_TYPE || typeof d.sourceId !== 'string') return;
    if (d.sourceId === BROADCAST_TAB_ID) return;
    if (hasExplicitLogoutMarker()) return;
    if (typeof d.currentSessionId === 'string' && d.currentSessionId.length > 0) {
      persistSessionIdOnly(d.currentSessionId);
    }
    const now = Date.now();
    if (now - lastPeerBroadcastRefreshAt < PEER_BROADCAST_REFRESH_COOLDOWN_MS) return;
    lastPeerBroadcastRefreshAt = now;

    const storedToken = readStoredAccessToken();
    if (storedToken) {
      const expMs = decodeJwtExpMs(storedToken);
      if (expMs && expMs - Date.now() > ACCESS_LEEWAY_MS) {
        applyAccessTokenFromRefresh(storedToken);
        scheduleProactiveAccessRefresh(storedToken);
        lastSuccessfulRefreshAt = now;
        lastSuccessfulRefreshToken = storedToken;
        return;
      }
    }
    void refreshAccessTokenSingleFlight().then((t) => {
      if (t) scheduleProactiveAccessRefresh(t);
    });
  };
}

function clearProactiveTimer() {
  if (proactiveTimer) {
    clearTimeout(proactiveTimer);
    proactiveTimer = null;
  }
}

export function scheduleProactiveAccessRefresh(accessToken: string) {
  if (hasExplicitLogoutMarker()) return;
  clearProactiveTimer();
  const expMs = decodeJwtExpMs(accessToken);
  if (!expMs) return;
  const refreshAndReschedule = () => {
    void refreshAccessTokenSingleFlight().then((t) => {
      if (t && t !== accessToken) scheduleProactiveAccessRefresh(t);
    });
  };
  const msUntilExp = expMs - Date.now();
  if (msUntilExp <= ACCESS_LEEWAY_MS) {
    proactiveTimer = setTimeout(refreshAndReschedule, 0);
    return;
  }
  const desiredLeadMs = Math.min(ACCESS_LEEWAY_MS, Math.floor(msUntilExp * 0.5));
  const delayMs = Math.max(30_000, msUntilExp - desiredLeadMs);
  proactiveTimer = setTimeout(refreshAndReschedule, delayMs);
}

async function postRefresh(refreshToken: string): Promise<{
  token: string;
  refreshToken?: string;
  currentSessionId?: string;
}> {
  try {
    const trimmed = refreshToken.trim();
    const body = trimmed ? { refreshToken: trimmed } : {};
    const refreshRequestId = await getOrCreateRefreshRequestId(trimmed);
    const { data } = await refreshClient.post<{
      success: boolean;
      data: { token: string; refreshToken?: string; user?: unknown; currentSessionId?: string };
    }>('/auth/refresh', body, {
      ...(refreshRequestId ? { headers: { 'X-Refresh-Request-Id': refreshRequestId } } : {}),
    });
    if (!data?.success || !data.data?.token) {
      // Malformed success body is transient (proxy/CDN), not a dead refresh session.
      throw new Error('auth.refreshMalformed');
    }
    return {
      token: data.data.token,
      refreshToken: data.data.refreshToken,
      currentSessionId: data.data.currentSessionId,
    };
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
      const code = (e.response.data as { code?: string }).code;
      if (typeof code === 'string') refreshFailure(code);
    }
    throw e;
  }
}

async function persistRotatedBundle(out: {
  refreshToken?: string;
  currentSessionId?: string;
}, presentedToken: string): Promise<void> {
  const webRt = isWebHttpOnlyRefreshCookie();
  if (out.refreshToken || !webRt) {
    await persistRefreshBundle(out.refreshToken ?? presentedToken, out.currentSessionId);
    return;
  }
  await persistRefreshBundle(undefined, out.currentSessionId, { webCookieMode: true });
}

export async function runRefresh(): Promise<string | null> {
  lastRefreshRunClearedCredentials = false;
  lastRefreshRunFailureCode = null;
  const execute = async (): Promise<string | null> => {
    if (hasExplicitLogoutMarker()) {
      lastRefreshRunFailureCode = 'auth.explicitLogout';
      return null;
    }

    for (let attempt = 0; attempt < REFRESH_ATTEMPTS; attempt++) {
      let rt = '';
      try {
        rt = (await getRefreshTokenForRequest())?.trim() ?? '';
      } catch {
        lastRefreshRunFailureCode = 'auth.refreshCredentialUnavailable';
        return null;
      }
      if (!rt && !isWebHttpOnlyRefreshCookie()) {
        lastRefreshRunFailureCode = 'auth.refreshTokenRequired';
        return null;
      }
      try {
        const genBeforePost = getApiAuthCredentialGeneration();
        const out = await postRefresh(rt);
        if (getApiAuthCredentialGeneration() !== genBeforePost) return null;
        await persistRotatedBundle(out, rt);
        applyAccessTokenFromRefresh(out.token);
        clearRefreshRequestId();
        lastSuccessfulRefreshAt = Date.now();
        lastSuccessfulRefreshToken = out.token;
        lastRefreshRunFailureCode = null;
        scheduleProactiveAccessRefresh(out.token);
        broadcastAuthRefreshSignal(out.currentSessionId);
        return out.token;
      } catch (e) {
        const code = (e as RefreshFailure).refreshCode;
        lastRefreshRunFailureCode = code ?? null;
        if (isRetryableRefreshCode(code, attempt, REFRESH_ATTEMPTS)) {
          if (code === 'auth.refreshReused') clearRefreshRequestId();
          await delay(180 * (attempt + 1));
          continue;
        }
        if (isHardRefreshReject(code)) {
          if (isWebHttpOnlyRefreshCookie()) {
            try {
              await refreshClient.post('/auth/logout', {}, {
                ...( { skipAuth401Handler: true } as Record<string, unknown> ),
              });
            } catch {
              /* best-effort cookie revoke */
            }
          }
          await clearRefreshBundle();
          markDurableRefreshCleared();
        }
        return null;
      }
    }
    return null;
  };

  if (typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function') {
    return navigator.locks.request(CROSS_TAB_REFRESH_LOCK, execute);
  }
  return execute();
}

export function refreshAccessTokenSingleFlight(): Promise<string | null> {
  if (hasExplicitLogoutMarker()) {
    lastRefreshRunFailureCode = 'auth.explicitLogout';
    return Promise.resolve(null);
  }
  if (!refreshPromise) {
    const cached = lastSuccessfulRefreshToken;
    if (
      cached &&
      lastSuccessfulRefreshAt > 0 &&
      Date.now() - lastSuccessfulRefreshAt < MIN_GLOBAL_REFRESH_INTERVAL_MS
    ) {
      const expMs = decodeJwtExpMs(cached);
      if (!expMs || expMs - Date.now() > ACCESS_LEEWAY_MS) {
        return Promise.resolve(cached);
      }
    }
    refreshPromise = runRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export function clearProactiveAccessRefresh() {
  clearProactiveTimer();
  lastSuccessfulRefreshAt = 0;
  lastSuccessfulRefreshToken = null;
  lastPeerBroadcastRefreshAt = 0;
}

function shouldForceClearAfterFailedRefresh(): boolean {
  return consumeRefreshRunClearedCredentials() || isHardRefreshReject(consumeLastRefreshRunFailureCode());
}

function bearerFromAxiosConfig(cfg: AxiosError['config']): string | null {
  const headers = cfg?.headers;
  if (!headers) return null;
  const authUnknown =
    typeof (headers as { get?: (name: string) => unknown }).get === 'function'
      ? (headers as { get: (name: string) => unknown }).get('Authorization') ??
        (headers as { get: (name: string) => unknown }).get('authorization')
      : (headers as unknown as Record<string, unknown>).Authorization ??
        (headers as unknown as Record<string, unknown>).authorization;
  const raw = typeof authUnknown === 'string' ? authUnknown : null;
  if (!raw || !raw.startsWith('Bearer ')) return null;
  return raw.slice('Bearer '.length).trim() || null;
}

async function retryRequestWithFreshAccess(error: AxiosError): Promise<unknown> {
  const cfg = error.config;
  // Second 401 on the same Axios config after a successful refresh is not proof the
  // session is dead (permission, race, or stale cached access). Reject without logout.
  if (!cfg || retriedRequestAfterRefresh.has(cfg)) {
    return Promise.reject(error);
  }
  retriedRequestAfterRefresh.add(cfg);

  const newTok = await refreshAccessTokenSingleFlight();
  if (!newTok) {
    if (shouldForceClearAfterFailedRefresh()) {
      handleApiUnauthorizedIfNeeded({ forceSessionClear: true });
    }
    return Promise.reject(error);
  }
  cfg.headers = cfg.headers || {};
  cfg.headers.Authorization = `Bearer ${newTok}`;
  return api.request(cfg);
}

export async function handleAxios401MaybeRefresh(error: AxiosError): Promise<unknown> {
  if (error.response?.status !== 401) return Promise.reject(error);
  if ((error.config as { skipAuth401Handler?: boolean } | undefined)?.skipAuth401Handler) {
    return Promise.reject(error);
  }
  if (!isCapacitor()) {
    await awaitAuthForegroundSettle();
  }
  if (isStaleApiAuthCredentialGeneration(error.config)) {
    return Promise.reject(error);
  }

  const code = (error.response?.data as { code?: string } | undefined)?.code;
  const url = String(error.config?.url || '');
  if (url.includes('/auth/refresh') || hasExplicitLogoutMarker()) {
    return Promise.reject(error);
  }
  if (/\/auth\/(login|register)\//.test(url) || url.includes('/telegram/verify')) {
    return Promise.reject(error);
  }
  if (code && AUTH_CODES_SKIP_REFRESH.has(code)) {
    await clearRefreshBundle();
    handleApiUnauthorizedIfNeeded({ forceSessionClear: true });
    return Promise.reject(error);
  }

  invalidateCachedAccessToken(bearerFromAxiosConfig(error.config));

  let rt: string | null = null;
  try {
    rt = await getRefreshTokenForRequest();
  } catch {
    return Promise.reject(error);
  }
  const canRefresh = !!(rt && rt.trim()) || isWebHttpOnlyRefreshCookie();
  if (!canRefresh) {
    handleApiUnauthorizedIfNeeded();
    return Promise.reject(error);
  }
  return retryRequestWithFreshAccess(error);
}
