import { chatApi } from '@/api/chat';
import { pullMissedAndPersistToDexie } from '@/services/chat/chatThreadNetworkSync';
import { applyThreadEvent } from '@/services/chat/chatLocalApplyThreadEvent';
import { refreshChatOfflineBanner } from '@/services/chat/chatOfflineBanner';
import {
  enqueueChatSyncPull,
  SYNC_PRIORITY_FOREGROUND,
  SYNC_PRIORITY_VIEWING,
} from '@/services/chat/chatSyncScheduler';
import {
  resolveAccessibleGameChatTypes,
  type GameChatSyncContext,
} from '@/services/chat/resolveGameChatSyncTypes';
import { useChatSyncStore, ChatContextType } from '@/store/chatSyncStore';
import { useUnreadStore } from '@/store/unreadStore';
import type { ChatType } from '@/types';
import { normalizeChatType } from '@/utils/chatType';

/** Wall-clock cap for foreground / post-rejoin bulk sync (GAME = up to 3 pulls per room). */
const SYNC_ALL_CONTEXTS_WAVE_MS = 28_000;

let syncAllContextsGeneration = 0;

function formatChatRoomRef(r: ChatRoomRef): string {
  return r.gameChatType
    ? `${r.contextType}:${r.contextId}:${r.gameChatType}`
    : `${r.contextType}:${r.contextId}`;
}

export interface ChatRoomRef {
  contextType: ChatContextType;
  contextId: string;
  gameChatType?: ChatType;
  gameSyncContext?: GameChatSyncContext;
}

export const chatSyncService = {
  async syncContext(
    contextType: ChatContextType,
    contextId: string,
    gameChatType?: ChatType,
    options?: { gameSyncContext?: GameChatSyncContext }
  ): Promise<void> {
    if (contextType === 'GAME' && !gameChatType) {
      const chatTypes = await resolveAccessibleGameChatTypes(contextId, options?.gameSyncContext);
      for (const ct of chatTypes) {
        const normalized = normalizeChatType(ct);
        try {
          const messages = await pullMissedAndPersistToDexie({
            contextType,
            contextId,
            gameChatType: normalized,
          });
          if (messages.length > 0) {
            void applyThreadEvent({
              kind: 'missedBuffer',
              contextType,
              contextId,
              messages,
              gameChatType: normalized,
            });
          }
        } catch (err) {
          console.error(`[chatSync] syncContext ${contextType}:${contextId}:${normalized} failed:`, err);
        }
      }
      return;
    }

    if (contextType !== 'GAME') {
      return;
    }

    try {
      const messages = await pullMissedAndPersistToDexie({
        contextType,
        contextId,
        gameChatType,
      });
      if (messages.length > 0) {
        void applyThreadEvent({
          kind: 'missedBuffer',
          contextType,
          contextId,
          messages,
          gameChatType,
        });
      }
    } catch (err) {
      console.error(`[chatSync] syncContext ${contextType}:${contextId} failed:`, err);
    }
  },

  async syncAllContexts(
    rooms: ChatRoomRef[],
    options?: { viewingContextKeys?: Set<string> }
  ): Promise<void> {
    if (rooms.length === 0) return;
    const generation = ++syncAllContextsGeneration;
    const { setSyncInProgress, setLastSyncCompletedAt } = useChatSyncStore.getState();
    setSyncInProgress(true);
    refreshChatOfflineBanner();

    try {
      const syncWave = Promise.all(
        rooms.map(async (r) => {
          await this.syncContext(r.contextType, r.contextId, r.gameChatType, {
            gameSyncContext: r.gameSyncContext,
          });
          const ctxKey = `${r.contextType}:${r.contextId}`;
          const priority = options?.viewingContextKeys?.has(ctxKey)
            ? SYNC_PRIORITY_VIEWING
            : SYNC_PRIORITY_FOREGROUND;
          enqueueChatSyncPull(r.contextType, r.contextId, priority);
        })
      );
      const timeoutSignal = new Promise<'timeout'>((resolve) => {
        setTimeout(() => resolve('timeout'), SYNC_ALL_CONTEXTS_WAVE_MS);
      });

      const outcome = await Promise.race([
        syncWave.then(() => 'completed' as const),
        timeoutSignal,
      ]);

      if (outcome === 'timeout') {
        console.warn(
          `[chatSync] syncAllContexts wave timed out after ${SYNC_ALL_CONTEXTS_WAVE_MS}ms; rooms=${rooms.map(formatChatRoomRef).join(', ')}`
        );
      } else {
        chatApi.invalidateUnreadCache();
        try {
          await useUnreadStore.getState().refreshAll();
        } catch {
          // list will refetch when opened
        }
      }
    } finally {
      if (generation === syncAllContextsGeneration) {
        setSyncInProgress(false);
        setLastSyncCompletedAt(Date.now());
        refreshChatOfflineBanner();
      }
    }
  },

  invalidateUnread: () => {
    chatApi.invalidateUnreadCache();
  },

  async refreshUnreadAndList(): Promise<void> {
    chatApi.invalidateUnreadCache();
    try {
      await useUnreadStore.getState().refreshAll();
    } catch {
      // list will refetch when opened
    }
    useChatSyncStore.getState().setLastSyncCompletedAt(Date.now());
  },
};
