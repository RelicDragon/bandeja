import { registerPlugin, Capacitor, type PluginListenerHandle } from '@capacitor/core';

interface PendingPushTapNotification {
  id?: string;
  data?: Record<string, unknown>;
}

export interface PendingPushTapAction {
  pending: boolean;
  actionId?: string;
  notification?: PendingPushTapNotification;
}

interface PushTapBridgePlugin {
  consumePendingTap(): Promise<PendingPushTapAction>;
  addListener(
    eventName: 'pendingPushTap',
    listenerFunc: (action: PendingPushTapAction) => void
  ): Promise<PluginListenerHandle>;
}

const PushTapBridge = registerPlugin<PushTapBridgePlugin>('PushTapBridge');

export async function consumePendingPushTapNative(): Promise<PendingPushTapAction | null> {
  if (Capacitor.getPlatform() !== 'android') {
    return null;
  }
  try {
    return await PushTapBridge.consumePendingTap();
  } catch (error) {
    console.warn('[push-tap] consumePendingTap failed', error);
    return null;
  }
}

export async function addPendingPushTapListener(
  listener: (action: PendingPushTapAction) => void
): Promise<PluginListenerHandle | null> {
  if (Capacitor.getPlatform() !== 'android') {
    return null;
  }
  try {
    return await PushTapBridge.addListener('pendingPushTap', listener);
  } catch (error) {
    console.warn('[push-tap] add pendingPushTap listener failed', error);
    return null;
  }
}
