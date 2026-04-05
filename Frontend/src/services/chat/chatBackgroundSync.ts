import { isCapacitor } from '@/utils/capacitor';
import { flushAllChatOfflineQueues } from './chatUnifiedOfflineFlush';
import { requestChatOfflineBackgroundSync } from './chatBackgroundSyncRegister';

export const CHAT_OFFLINE_FLUSH_REQUEST = 'CHAT_OFFLINE_FLUSH_REQUEST';
export const CHAT_OFFLINE_FLUSH_ACK = 'CHAT_OFFLINE_FLUSH_ACK';

export function initChatBackgroundSyncClient(): void {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker?.addEventListener) return;
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== navigator.serviceWorker) return;
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

  if (isCapacitor() || typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      requestChatOfflineBackgroundSync();
    }
  });
}
