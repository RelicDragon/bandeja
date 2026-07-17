import { App as CapApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { isCapacitor } from '@/utils/capacitor';
import { socketService } from '@/services/socketService';
import { chatSyncService, type ChatRoomRef } from '@/services/chatSyncService';
import pushNotificationService from '@/services/pushNotificationService';
import { useChatSyncStore } from '@/store/chatSyncStore';
import { useAuthStore } from '@/store/authStore';
import {
  warmChatSyncHeads,
  collectContextsForWarmEnriched,
  shouldDeferImplicitChatWarm,
} from '@/services/chat/chatSyncBatchWarm';
import { useGameDetailsChromeStore } from '@/components/GameDetails/gameDetailsChromeStore';
import { setChatSyncNativeAppActive } from '@/services/chat/chatSyncAppVisibility';
import { recordChatSyncForegroundSyncMs } from '@/services/chat/chatSyncMetrics';
import { purgeExpiredFailedOutbox } from '@/services/chat/chatOutboxExpiry';
import {
  flushAllChatOfflineQueues,
  scheduleUnifiedChatOfflineFlush,
} from '@/services/chat/chatUnifiedOfflineFlush';
import { registerForegroundChatSync } from '@/utils/foregroundChatSyncRegistry';
import { ensureChatPersistentStorageOnce, probeChatStoragePressure } from '@/services/chat/chatPersistentStorage';
import {
  cleanupNativeChatViewingSync,
  initNativeChatViewingSync,
} from '@/services/push/chatViewingBridge';

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
  const authState = useAuthStore.getState();
  if (authState.isAuthenticated && !authState.isInitializing) {
    void ensureChatPersistentStorageOnce();
    void probeChatStoragePressure();
    if (!shouldDeferImplicitChatWarm()) {
      void warmChatSyncHeads(undefined, { enrichFromUnread: true });
    }
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
  const nav = useGameDetailsChromeStore.getState();
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
  const viewingContextKeys = new Set(viewing.map((r) => `${r.contextType}:${r.contextId}`));

  if (useChatSyncStore.getState().syncInProgress) return;

  if (rooms.length > 0) {
    chatSyncService
      .syncAllContexts(rooms, { viewingContextKeys })
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
      initNativeChatViewingSync();
      if (!capUnsubscribe) {
        void CapApp.getState()
          .then((s) => setChatSyncNativeAppActive(s.isActive))
          .catch(() => {});
        CapApp.addListener('appStateChange', ({ isActive }) => {
          setChatSyncNativeAppActive(isActive);
          if (!isActive) {
            void flushAllChatOfflineQueues();
            return;
          }
          runForegroundSync();
          const auth = useAuthStore.getState();
          if (auth.isAuthenticated && !auth.isInitializing) {
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
    cleanupNativeChatViewingSync();
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
