import { Capacitor } from '@capacitor/core';
import { clearRefreshTokenNative, getRefreshTokenNative, setRefreshTokenNative } from '@/services/authBridge';

const LS_REFRESH = 'padelpulse_refresh_token';
const LS_SESSION = 'padelpulse_current_session_id';
const LS_REFRESH_REQUEST_ID = 'padelpulse_refresh_request_id';
const REFRESH_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

export function isWebHttpOnlyRefreshCookie(): boolean {
  if (Capacitor.isNativePlatform()) return false;
  return import.meta.env.VITE_WEB_REFRESH_HTTPONLY_COOKIE !== 'false';
}

export function getStoredRefreshTokenSync(): string | null {
  try {
    return localStorage.getItem(LS_REFRESH);
  } catch {
    return null;
  }
}

export function getCurrentSessionIdSync(): string | null {
  try {
    return localStorage.getItem(LS_SESSION);
  } catch {
    return null;
  }
}

export function persistSessionIdOnly(currentSessionId: string | undefined | null): void {
  if (!currentSessionId) return;
  try {
    localStorage.setItem(LS_SESSION, currentSessionId);
  } catch {
    /* no-op */
  }
}

async function deterministicNativeRefreshRequestId(refreshToken: string): Promise<string | null> {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const input = new TextEncoder().encode(`bandeja-refresh-request-v1:${refreshToken}`);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', input);
    const hex = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    return `native-v1-${hex}`;
  } catch {
    return null;
  }
}

export async function getOrCreateRefreshRequestId(refreshToken?: string): Promise<string | null> {
  if (Capacitor.isNativePlatform() && refreshToken) {
    const deterministic = await deterministicNativeRefreshRequestId(refreshToken);
    if (deterministic) return deterministic;
  }
  // Cookie-only web: omit the request id so the server touches the live session instead of
  // rotating. Rotation + a leftover host-only pp_rt duplicate is what idle-logouted bandeja.me.
  if (!Capacitor.isNativePlatform() && isWebHttpOnlyRefreshCookie() && !refreshToken?.trim()) {
    return null;
  }
  const readOrCreate = (): string | null => {
    try {
      const existing = localStorage.getItem(LS_REFRESH_REQUEST_ID)?.trim() ?? '';
      if (REFRESH_REQUEST_ID_PATTERN.test(existing)) return existing;
      const generated =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `refresh-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
      localStorage.setItem(LS_REFRESH_REQUEST_ID, generated);
      return localStorage.getItem(LS_REFRESH_REQUEST_ID) === generated ? generated : null;
    } catch {
      return null;
    }
  };
  if (typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function') {
    return navigator.locks.request('padelpulse-refresh-request-id', readOrCreate);
  }
  return readOrCreate();
}

export function clearRefreshRequestId(): void {
  try {
    localStorage.removeItem(LS_REFRESH_REQUEST_ID);
  } catch {
    /* no-op */
  }
}

export async function getRefreshTokenForRequest(): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    const n = await getRefreshTokenNative();
    if (n) return n;
    // Migrate credentials written by older app builds into authoritative secure storage.
    const legacy = getStoredRefreshTokenSync()?.trim() ?? '';
    if (legacy) {
      await setRefreshTokenNative(legacy);
      const verified = await getRefreshTokenNative();
      if (verified) {
        try {
          localStorage.removeItem(LS_REFRESH);
        } catch {
          /* no-op */
        }
        return verified;
      }
      return legacy;
    }
    return null;
  }
  const ls = getStoredRefreshTokenSync()?.trim() ?? '';
  if (isWebHttpOnlyRefreshCookie()) {
    // Cookie is authoritative once set. Until then, keep legacy LS as a one-time body fallback
    // so a deploy reload cannot delete the only refresh credential before refresh runs.
    return ls || null;
  }
  return ls || null;
}

export async function persistRefreshBundle(
  refreshToken: string | undefined,
  currentSessionId: string | undefined,
  opts?: { webCookieMode?: boolean }
) {
  if (refreshToken) {
    if (Capacitor.isNativePlatform()) {
      await setRefreshTokenNative(refreshToken);
      try {
        localStorage.removeItem(LS_REFRESH);
      } catch {
        /* no-op */
      }
    } else {
      localStorage.setItem(LS_REFRESH, refreshToken);
    }
  } else if (opts?.webCookieMode) {
    try {
      localStorage.removeItem(LS_REFRESH);
    } catch {
      /* no-op */
    }
  } else {
    localStorage.removeItem(LS_REFRESH);
    await clearRefreshTokenNative();
  }
  if (currentSessionId) {
    try {
      localStorage.setItem(LS_SESSION, currentSessionId);
    } catch {
      /* session id is display metadata; the secure refresh credential remains authoritative */
    }
  } else {
    try {
      localStorage.removeItem(LS_SESSION);
    } catch {
      /* no-op */
    }
  }
}

export async function clearRefreshBundle() {
  try {
    localStorage.removeItem(LS_REFRESH);
    localStorage.removeItem(LS_SESSION);
    localStorage.removeItem(LS_REFRESH_REQUEST_ID);
  } catch {
    /* continue with native cleanup */
  }
  try {
    await clearRefreshTokenNative();
  } catch {
    // The bridge logged the storage failure. Local logout must still be allowed to finish.
  }
}
