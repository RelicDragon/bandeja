import { registerPlugin, Capacitor } from '@capacitor/core';
import type { User } from '@/types';
import { resolveNativeApiBaseUrl } from '@/api/apiBaseUrl';

import type { BrandingSplashLogoKey } from '@/config/appIcons';

interface AuthBridgePlugin {
  setToken(options: { token: string }): Promise<void>;
  getToken(): Promise<{ token: string | null }>;
  deleteToken(): Promise<void>;
  setRefreshToken(options: { token: string }): Promise<void>;
  getRefreshToken(): Promise<{ token: string | null }>;
  deleteRefreshToken(): Promise<void>;
  setApiBaseUrl(options: { apiBaseUrl: string }): Promise<void>;
  syncWatchPreferences(options: {
    language?: string;
    weekStart?: string;
    defaultCurrency?: string;
    timeFormat?: string;
  }): Promise<void>;
  setAppIconBadgeCount(options: { count: number }): Promise<void>;
  getAppIconBadgeCount(): Promise<{ count: number }>;
  syncBrandingLogo(options: { logoKey: string }): Promise<void>;
  notifyAppShellReady(): Promise<void>;
}

const AuthBridge = registerPlugin<AuthBridgePlugin>('AuthBridge');

export async function syncApiBaseUrlToNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await AuthBridge.setApiBaseUrl({ apiBaseUrl: resolveNativeApiBaseUrl() });
  } catch (error) {
    console.warn('AuthBridge: failed to sync API base URL to native', error);
  }
}

export async function syncTokenToNative(token: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await AuthBridge.setToken({ token });
  } catch (error) {
    console.warn('AuthBridge: failed to sync token to native', error);
  }
}

export async function getTokenNative(): Promise<string | null> {
  if (Capacitor.getPlatform() !== 'ios') return null;
  try {
    const r = await AuthBridge.getToken();
    return r?.token ?? null;
  } catch {
    return null;
  }
}

export async function syncLogoutToNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await AuthBridge.deleteToken();
  } catch (error) {
    console.warn('AuthBridge: failed to sync logout to native', error);
  }
}

export async function setRefreshTokenNative(token: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await AuthBridge.setRefreshToken({ token });
  } catch (error) {
    console.warn('AuthBridge: failed to persist refresh token', error);
  }
}

export async function getRefreshTokenNative(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const r = await AuthBridge.getRefreshToken();
    return r?.token ?? null;
  } catch {
    return null;
  }
}

export async function clearRefreshTokenNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await AuthBridge.deleteRefreshToken();
  } catch {
    /* ignore */
  }
}

export async function syncWatchPreferencesToNative(
  user: Pick<User, 'language' | 'weekStart' | 'defaultCurrency' | 'timeFormat'> | null | undefined
): Promise<void> {
  if (Capacitor.getPlatform() !== 'ios') return;
  try {
    await AuthBridge.syncWatchPreferences({
      language: user?.language ?? 'auto',
      weekStart: user?.weekStart ?? 'auto',
      defaultCurrency: user?.defaultCurrency ?? 'auto',
      timeFormat: user?.timeFormat ?? 'auto',
    });
  } catch (error) {
    console.warn('AuthBridge: failed to sync watch preferences to native', error);
  }
}

export async function setAppIconBadgeCountNative(count: number): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
    await AuthBridge.setAppIconBadgeCount({ count: safeCount });
  } catch (error) {
    console.warn('AuthBridge: failed to set app icon badge', error);
  }
}

export async function getAppIconBadgeCountNative(): Promise<number> {
  if (!Capacitor.isNativePlatform()) return 0;
  try {
    const r = await AuthBridge.getAppIconBadgeCount();
    const count = r?.count ?? 0;
    return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  } catch {
    return 0;
  }
}

export async function syncBrandingLogoToNative(logoKey: BrandingSplashLogoKey): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await AuthBridge.syncBrandingLogo({ logoKey });
  } catch (error) {
    console.warn('AuthBridge: failed to sync branding splash logo', error);
  }
}

export async function notifyAppShellReadyToNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await AuthBridge.notifyAppShellReady();
  } catch (error) {
    console.warn('AuthBridge: failed to notify app shell ready', error);
  }
}
