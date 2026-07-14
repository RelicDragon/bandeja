import { registerPlugin, Capacitor } from '@capacitor/core';
import type { NextGamesEnvelope } from '@/widgets/cachedNextGameDto';

interface WidgetBridgePlugin {
  syncNextGames(options: NextGamesEnvelope): Promise<void>;
  clearNextGames(): Promise<void>;
}

const WidgetBridge = registerPlugin<WidgetBridgePlugin>('WidgetBridge');

/** @returns false when the native write failed (web/no-op still returns true). */
export async function syncNextGamesToNative(envelope: NextGamesEnvelope): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    await WidgetBridge.syncNextGames(envelope);
    return true;
  } catch (error) {
    console.warn('WidgetBridge: failed to sync next games', error);
    return false;
  }
}

/** @returns false when the native clear failed (web/no-op still returns true). */
export async function clearNextGamesToNative(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    await WidgetBridge.clearNextGames();
    return true;
  } catch (error) {
    console.warn('WidgetBridge: failed to clear next games', error);
    return false;
  }
}
