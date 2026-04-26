import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { getApiAxiosBaseURL } from '@/api/apiBaseUrl';
import { api } from '@/api/httpClient';
import { getClientAppSemver } from '@/utils/clientAppVersion';
import { isCapacitor } from '@/utils/capacitor';
import { Capacitor } from '@capacitor/core';
import { applyAccessTokenFromRefresh } from '@/store/authAccessSink';
import {
  clearRefreshBundle,
  getRefreshTokenForRequest,
  isWebHttpOnlyRefreshCookie,
  persistRefreshBundle,
  persistSessionIdOnly,
} from '@/services/refreshTokenPersistence';
import { handleApiUnauthorizedIfNeeded } from '@/api/handleApiUnauthorized';
import { isStaleApiAuthCredentialGeneration } from '@/api/apiAuthCredentialGeneration';

const AUTH_CHANNEL = 'padelpulse-auth-v2';
const AUTH_SYNC_TYPE = 'padelpulse-auth-sync-v2';

const BROADCAST_TAB_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

let lastPeerBroadcastRefreshAt = 0;
const PEER_BROADCAST_REFRESH_COOLDOWN_MS = 450;

/** 401 codes where refresh cannot fix the session — go straight to client logout. */
export const AUTH_CODES_SKIP_REFRESH = new Set([
  'auth.noToken',
  'auth.userNotFound',
  'auth.userInactive',
  'auth.notAuthenticated',
  'auth.invalidCredentials',
  'auth.phoneLoginRequiresOAuth',
  'auth.clientUpgradeRequired',
]);

function requestHadBearer(config?: InternalAxiosRequestConfig): boolean {
  if (!config?.headers) return false;
  const h = config.headers as { get?: (k: string) => string | undefined; Authorization?: string; authorization?: string };
  const raw =
    typeof h.get === 'function'
      ? h.get('Authorization') ?? h.get('authorization')
      : h.Authorization ?? h.authorization;
  return typeof raw === 'string' && raw.startsWith('Bearer ');
}

const ACCESS_LEEWAY_MS = ((): number => {
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
  baseURL: getApiAxiosBaseURL(),
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  timeout: 20_000,
  withCredentials: !isCapacitor(),
});

refreshClient.interceptors.request.use((config) => {
  config.headers['X-Client-Version'] = getClientAppSemver();
  config.headers['X-Client-Platform'] = clientPlatformHeader();
  return config;
});

let refreshPromise: Promise<string | null> | null = null;
let proactiveTimer: ReturnType<typeof setTimeout> | null = null;
let authBroadcastChannel: BroadcastChannel | null = null;
const retriedRequestAfterRefresh = new WeakSet<object>();
/** Set when the last `runRefresh` cleared stored refresh credentials (server rejected rotation). */
let lastRefreshRunClearedCredentials = false;

export function consumeRefreshRunClearedCredentials(): boolean {
  const v = lastRefreshRunClearedCredentials;
  lastRefreshRunClearedCredentials = false;
  return v;
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
    if (typeof d.currentSessionId === 'string' && d.currentSessionId.length > 0) {
      persistSessionIdOnly(d.currentSessionId);
    }
    const now = Date.now();
    if (now - lastPeerBroadcastRefreshAt < PEER_BROADCAST_REFRESH_COOLDOWN_MS) return;
    lastPeerBroadcastRefreshAt = now;
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
  clearProactiveTimer();
  const expMs = decodeJwtExpMs(accessToken);
  if (!expMs) return;
  const msUntilExp = expMs - Date.now();
  if (msUntilExp <= ACCESS_LEEWAY_MS + 3_000) {
    void refreshAccessTokenSingleFlight().then((t) => {
      if (t) scheduleProactiveAccessRefresh(t);
    });
    return;
  }
  const delay = Math.max(2_000, expMs - Date.now() - ACCESS_LEEWAY_MS);
  proactiveTimer = setTimeout(() => {
    void refreshAccessTokenSingleFlight().then((t) => {
      if (t) scheduleProactiveAccessRefresh(t);
    });
  }, delay);
}

async function postRefresh(refreshToken: string): Promise<{
  token: string;
  refreshToken?: string;
  currentSessionId?: string;
}> {
  try {
    const trimmed = refreshToken.trim();
    const body = trimmed ? { refreshToken: trimmed } : {};
    const { data } = await refreshClient.post<{
      success: boolean;
      data: { token: string; refreshToken?: string; user?: unknown; currentSessionId?: string };
    }>('/auth/refresh', body);
    if (!data?.success || !data.data?.token) {
      const err = new Error('refresh failed') as Error & { refreshCode?: string };
      err.refreshCode = 'auth.refreshInvalid';
      throw err;
    }
    return {
      token: data.data.token,
      refreshToken: data.data.refreshToken,
      currentSessionId: data.data.currentSessionId,
    };
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
      const code = (e.response.data as { code?: string }).code;
      if (typeof code === 'string') {
        const err = new Error('refresh failed') as Error & { refreshCode?: string };
        err.refreshCode = code;
        throw err;
      }
    }
    if (axios.isAxiosError(e) && e.response?.status === 401) {
      const err = new Error('refresh failed') as Error & { refreshCode?: string };
      err.refreshCode = 'auth.refreshInvalid';
      throw err;
    }
    throw e;
  }
}

export async function runRefresh(): Promise<string | null> {
  lastRefreshRunClearedCredentials = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    const rt = (await getRefreshTokenForRequest())?.trim() ?? '';
    if (!rt && !isWebHttpOnlyRefreshCookie()) return null;
    try {
      const out = await postRefresh(rt);
      applyAccessTokenFromRefresh(out.token);
      const webRt = isWebHttpOnlyRefreshCookie();
      if (out.refreshToken || !webRt) {
        await persistRefreshBundle(out.refreshToken ?? rt, out.currentSessionId);
      } else {
        await persistRefreshBundle(undefined, out.currentSessionId, { webCookieMode: true });
      }
      scheduleProactiveAccessRefresh(out.token);
      broadcastAuthRefreshSignal(out.currentSessionId);
      return out.token;
    } catch (e) {
      const code = (e as { refreshCode?: string }).refreshCode;
      if (code === 'auth.refreshReused' || code === 'auth.refreshExpired') {
        await clearRefreshBundle();
        lastRefreshRunClearedCredentials = true;
        return null;
      }
      if (code === 'auth.refreshInvalid' && attempt === 0) {
        await new Promise((r) => setTimeout(r, 180));
        continue;
      }
      if (code === 'auth.refreshInvalid') {
        await clearRefreshBundle();
        lastRefreshRunClearedCredentials = true;
      }
      return null;
    }
  }
  return null;
}

export function refreshAccessTokenSingleFlight(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = runRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export function clearProactiveAccessRefresh() {
  clearProactiveTimer();
}

export async function handleAxios401MaybeRefresh(error: AxiosError): Promise<unknown> {
  const status = error.response?.status;
  if (status !== 401) return Promise.reject(error);
  if ((error.config as { skipAuth401Handler?: boolean } | undefined)?.skipAuth401Handler) {
    return Promise.reject(error);
  }

  if (isStaleApiAuthCredentialGeneration(error.config)) {
    return Promise.reject(error);
  }

  const data = error.response?.data as { code?: string } | undefined;
  const code = data?.code;

  if (code && AUTH_CODES_SKIP_REFRESH.has(code)) {
    await clearRefreshBundle();
    handleApiUnauthorizedIfNeeded({ forceSessionClear: true });
    return Promise.reject(error);
  }

  const url = String(error.config?.url || '');
  if (url.includes('/auth/refresh')) {
    if (code === 'auth.refreshReused' || code === 'auth.refreshExpired') {
      await clearRefreshBundle();
      handleApiUnauthorizedIfNeeded({ forceSessionClear: true });
      return Promise.reject(error);
    }
    if (code === 'auth.refreshInvalid') {
      await new Promise((r) => setTimeout(r, 160));
      const recovered = await refreshAccessTokenSingleFlight();
      if (!recovered) {
        await clearRefreshBundle();
        handleApiUnauthorizedIfNeeded({ forceSessionClear: true });
      }
      return Promise.reject(error);
    }
    await clearRefreshBundle();
    handleApiUnauthorizedIfNeeded({ forceSessionClear: true });
    return Promise.reject(error);
  }
  if (/\/auth\/(login|register)\//.test(url) || url.includes('/telegram/verify')) {
    return Promise.reject(error);
  }

  if (code === 'auth.refreshReused' || code === 'auth.refreshExpired') {
    await clearRefreshBundle();
    handleApiUnauthorizedIfNeeded({ forceSessionClear: true });
    return Promise.reject(error);
  }

  if (code === 'auth.refreshInvalid') {
    await new Promise((r) => setTimeout(r, 160));
    const recovered = await refreshAccessTokenSingleFlight();
    const cfgInv = error.config;
    if (recovered && cfgInv && !retriedRequestAfterRefresh.has(cfgInv)) {
      retriedRequestAfterRefresh.add(cfgInv);
      cfgInv.headers = cfgInv.headers || {};
      cfgInv.headers.Authorization = `Bearer ${recovered}`;
      return api.request(cfgInv);
    }
    await clearRefreshBundle();
    handleApiUnauthorizedIfNeeded({ forceSessionClear: true });
    return Promise.reject(error);
  }

  const hadBearer = requestHadBearer(error.config);
  // Skip-refresh codes already returned above. Any other 401 with Bearer may be a stale
  // access token; try refresh instead of logging out (fixes e.g. re-login after logout on web).
  const authLike = hadBearer;

  const rt = await getRefreshTokenForRequest();
  const canRefresh = !!(rt && rt.trim()) || isWebHttpOnlyRefreshCookie();
  if (!canRefresh || !authLike) {
    handleApiUnauthorizedIfNeeded();
    return Promise.reject(error);
  }

  const cfg = error.config;
  if (!cfg || retriedRequestAfterRefresh.has(cfg)) {
    handleApiUnauthorizedIfNeeded();
    return Promise.reject(error);
  }
  retriedRequestAfterRefresh.add(cfg);

  const newTok = await refreshAccessTokenSingleFlight();
  if (!newTok) {
    if (consumeRefreshRunClearedCredentials()) {
      handleApiUnauthorizedIfNeeded({ forceSessionClear: true });
    } else {
      handleApiUnauthorizedIfNeeded();
    }
    return Promise.reject(error);
  }
  cfg.headers = cfg.headers || {};
  cfg.headers.Authorization = `Bearer ${newTok}`;
  return api.request(cfg);
}
