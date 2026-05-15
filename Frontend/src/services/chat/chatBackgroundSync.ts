import { App as CapApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { isCapacitor } from '@/utils/capacitor';
import { flushAllChatOfflineQueues } from './chatUnifiedOfflineFlush';
import { requestChatOfflineBackgroundSync } from './chatBackgroundSyncRegister';

let capBackgroundSyncHandle: PluginListenerHandle | null = null;

export const CHAT_OFFLINE_FLUSH_REQUEST = 'CHAT_OFFLINE_FLUSH_REQUEST';
export const CHAT_OFFLINE_FLUSH_ACK = 'CHAT_OFFLINE_FLUSH_ACK';

export function initChatBackgroundSyncClient(): void {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker?.addEventListener) return;
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    const ctrl = navigator.serviceWorker.controller;
    if (!ctrl || event.source !== ctrl) return;
    if (event.data?.type !== CHAT_OFFLINE_FLUSH_REQUEST) return;
    const port = event.ports[0];
    if (!port) return;
    void flushAllChatOfflineQueues()
      .catch(() => {})
      .finally(() => {
        try {
          port.postMessage({ type: CHAT_OFFLINE_FLUSH_ACK });
        } catch {
          /* closed */
        }
      });
  });

  if (typeof document !== 'undefined' && !isCapacitor()) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        requestChatOfflineBackgroundSync();
      }
    });
  }

  if (isCapacitor() && !capBackgroundSyncHandle) {
    void CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) void flushAllChatOfflineQueues();
    }).then((h) => {
      capBackgroundSyncHandle = h;
    });
  }
}

export function cleanupChatBackgroundSyncClient(): void {
  if (capBackgroundSyncHandle) {
    void capBackgroundSyncHandle.remove();
    capBackgroundSyncHandle = null;
  }
}
