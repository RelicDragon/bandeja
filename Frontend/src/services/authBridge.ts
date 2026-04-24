import { registerPlugin, Capacitor } from '@capacitor/core';
import type { User } from '@/types';

interface AuthBridgePlugin {
  setToken(options: { token: string }): Promise<void>;
  deleteToken(): Promise<void>;
  setRefreshToken(options: { token: string }): Promise<void>;
  getRefreshToken(): Promise<{ token: string | null }>;
  deleteRefreshToken(): Promise<void>;
  syncWatchPreferences(options: {
    language?: string;
    weekStart?: string;
    defaultCurrency?: string;
    timeFormat?: string;
  }): Promise<void>;
}

const AuthBridge = registerPlugin<AuthBridgePlugin>('AuthBridge');

export async function syncTokenToNative(token: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await AuthBridge.setToken({ token });
  } catch (error) {
    console.warn('AuthBridge: failed to sync token to native', error);
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
