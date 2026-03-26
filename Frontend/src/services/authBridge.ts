import { registerPlugin, Capacitor } from '@capacitor/core';

interface AuthBridgePlugin {
  setToken(options: { token: string }): Promise<void>;
  deleteToken(): Promise<void>;
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
