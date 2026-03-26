import { registerPlugin, Capacitor } from '@capacitor/core';
import type { User } from '@/types';

interface AuthBridgePlugin {
  setToken(options: { token: string }): Promise<void>;
  deleteToken(): Promise<void>;
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
