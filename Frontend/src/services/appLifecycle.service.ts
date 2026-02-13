import { App as CapApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { isCapacitor } from '@/utils/capacitor';
import { socketService } from '@/services/socketService';
import { chatSyncService } from '@/services/chatSyncService';
import { useChatSyncStore } from '@/store/chatSyncStore';

let capUnsubscribe: PluginListenerHandle | null = null;
let visibilityCleanup: (() => void) | null = null;

function runForegroundSync(): void {
  if (useChatSyncStore.getState().syncInProgress) return;
  socketService.ensureConnection();
  const rooms = socketService.getActiveChatRooms();
  if (rooms.length > 0) {
    chatSyncService.syncAllContexts(rooms).catch((err) => {
      console.error('[appLifecycle] Foreground sync failed:', err);
    });
  } else {
    chatSyncService.refreshUnreadAndList().catch((err) => {
      console.error('[appLifecycle] Refresh unread/list failed:', err);
    });
  }
}

export const appLifecycleService = {
  init(): void {
    if (isCapacitor()) {
      if (!capUnsubscribe) {
        CapApp.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            runForegroundSync();
          } else {
            socketService.disconnect();
          }
        }).then((h) => {
          capUnsubscribe = h;
        });
      }
    } else {
      if (!visibilityCleanup) {
        const handler = () => {
          if (document.visibilityState === 'visible') runForegroundSync();
        };
        document.addEventListener('visibilitychange', handler);
        visibilityCleanup = () => {
          document.removeEventListener('visibilitychange', handler);
          visibilityCleanup = null;
        };
      }
    }
  },

  cleanup(): void {
    if (capUnsubscribe) {
      capUnsubscribe.remove();
      capUnsubscribe = null;
    }
    if (visibilityCleanup) {
      visibilityCleanup();
      visibilityCleanup = null;
    }
  },
};
