import { App as CapApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { isCapacitor } from '@/utils/capacitor';
import { socketService } from '@/services/socketService';
import { chatSyncService, type ChatRoomRef } from '@/services/chatSyncService';
import pushNotificationService from '@/services/pushNotificationService';
import { useChatSyncStore } from '@/store/chatSyncStore';
import { useAuthStore } from '@/store/authStore';
import { warmChatSyncHeads, collectContextsForWarmEnriched } from '@/services/chat/chatSyncBatchWarm';
import { useNavigationStore } from '@/store/navigationStore';
import { enqueueChatSyncPull, SYNC_PRIORITY_VIEWING } from '@/services/chat/chatSyncScheduler';
import { setChatSyncNativeAppActive } from '@/services/chat/chatSyncAppVisibility';
import { recordChatSyncForegroundSyncMs } from '@/services/chat/chatSyncMetrics';
import { purgeExpiredFailedOutbox } from '@/services/chat/chatOutboxExpiry';
import { scheduleUnifiedChatOfflineFlush } from '@/services/chat/chatUnifiedOfflineFlush';
import { registerForegroundChatSync } from '@/utils/foregroundChatSyncRegistry';

let capUnsubscribe: PluginListenerHandle | null = null;
let visibilityCleanup: (() => void) | null = null;

export function triggerForegroundChatSync(): void {
  void runForegroundSync();
}

async function runForegroundSync(): Promise<void> {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const recordSyncDuration = () => {
    if (typeof performance !== 'undefined' && t0 > 0) {
      recordChatSyncForegroundSyncMs(performance.now() - t0);
    }
  };
  if (useAuthStore.getState().isAuthenticated) {
    void warmChatSyncHeads(undefined, { enrichFromUnread: true });
    void purgeExpiredFailedOutbox();
    scheduleUnifiedChatOfflineFlush();
    void import('@/services/chat/chatHotThreadPrefetch').then((m) => m.scheduleChatHotThreadPrefetchFromIdle());
  }
  socketService.ensureConnection();
  try {
    await Promise.race([
      socketService.waitForConnection(),
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
    ]);
  } catch {
    // proceed with sync even if socket not ready
  }
  const nav = useNavigationStore.getState();
  const viewing: ChatRoomRef[] = [];
  if (nav.viewingGameChatId) {
    viewing.push({
      contextType: 'GAME',
      contextId: nav.viewingGameChatId,
      gameChatType: nav.viewingGameChatChatType ?? undefined,
    });
  }
  if (nav.viewingUserChatId) viewing.push({ contextType: 'USER', contextId: nav.viewingUserChatId });
  if (nav.viewingGroupChannelId) viewing.push({ contextType: 'GROUP', contextId: nav.viewingGroupChannelId });
  for (const v of viewing) {
    enqueueChatSyncPull(v.contextType, v.contextId, SYNC_PRIORITY_VIEWING);
  }

  const socketRooms = socketService.getActiveChatRooms();
  const roomKey = (r: ChatRoomRef) => `${r.contextType}:${r.contextId}:${r.gameChatType ?? ''}`;
  const mergedMap = new Map<string, ChatRoomRef>();
  for (const r of socketRooms) mergedMap.set(roomKey(r), r);
  for (const r of viewing) mergedMap.set(roomKey(r), r);
  try {
    const warm = await collectContextsForWarmEnriched();
    for (const w of warm.slice(0, 14)) {
      const ref: ChatRoomRef = { contextType: w.contextType, contextId: w.contextId };
      const k = roomKey(ref);
      if (!mergedMap.has(k)) mergedMap.set(k, ref);
    }
  } catch {
    /* ignore */
  }
  const rooms = [...mergedMap.values()];

  if (useChatSyncStore.getState().syncInProgress) return;

  if (rooms.length > 0) {
    chatSyncService
      .syncAllContexts(rooms)
      .then(recordSyncDuration)
      .catch((err) => {
        console.error('[appLifecycle] Foreground sync failed:', err);
        recordSyncDuration();
      });
  } else {
    chatSyncService
      .refreshUnreadAndList()
      .then(recordSyncDuration)
      .catch((err) => {
        console.error('[appLifecycle] Refresh unread/list failed:', err);
        recordSyncDuration();
      });
  }
}

export const appLifecycleService = {
  init(): void {
    if (isCapacitor()) {
      if (!capUnsubscribe) {
        void CapApp.getState()
          .then((s) => setChatSyncNativeAppActive(s.isActive))
          .catch(() => {});
        CapApp.addListener('appStateChange', ({ isActive }) => {
          setChatSyncNativeAppActive(isActive);
          if (isActive) {
            runForegroundSync();
            void pushNotificationService.ensureTokenSentToBackend();
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
        const pageShow = (e: PageTransitionEvent) => {
          if (e.persisted) runForegroundSync();
        };
        document.addEventListener('visibilitychange', handler);
        window.addEventListener('pageshow', pageShow);
        visibilityCleanup = () => {
          document.removeEventListener('visibilitychange', handler);
          window.removeEventListener('pageshow', pageShow);
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

registerForegroundChatSync(triggerForegroundChatSync);
