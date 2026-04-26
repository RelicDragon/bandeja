import { Capacitor } from '@capacitor/core';
import { clearRefreshTokenNative, getRefreshTokenNative, setRefreshTokenNative } from '@/services/authBridge';

const LS_REFRESH = 'padelpulse_refresh_token';
const LS_SESSION = 'padelpulse_current_session_id';

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

export async function getRefreshTokenForRequest(): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    const n = await getRefreshTokenNative();
    if (n) return n;
  }
  const ls = getStoredRefreshTokenSync()?.trim() ?? '';
  if (isWebHttpOnlyRefreshCookie()) {
    if (ls) return ls;
    return null;
  }
  return ls || null;
}

export async function persistRefreshBundle(
  refreshToken: string | undefined,
  currentSessionId: string | undefined,
  opts?: { webCookieMode?: boolean }
) {
  try {
    if (refreshToken) {
      localStorage.setItem(LS_REFRESH, refreshToken);
      await setRefreshTokenNative(refreshToken);
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
      localStorage.setItem(LS_SESSION, currentSessionId);
    } else {
      localStorage.removeItem(LS_SESSION);
    }
  } catch {
    /* no-op */
  }
}

export async function clearRefreshBundle() {
  try {
    localStorage.removeItem(LS_REFRESH);
    localStorage.removeItem(LS_SESSION);
    await clearRefreshTokenNative();
  } catch {
    /* no-op */
  }
}
