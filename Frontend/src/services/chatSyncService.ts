import { chatApi } from '@/api/chat';
import { pullMissedAndPersistToDexie } from '@/services/chat/chatThreadNetworkSync';
import { scheduleWarmFromUnreadApiPayload } from '@/services/chat/chatSyncBatchWarm';
import { refreshChatOfflineBanner } from '@/services/chat/chatOfflineBanner';
import { enqueueChatSyncPull, SYNC_PRIORITY_FOREGROUND } from '@/services/chat/chatSyncScheduler';
import { unreadApiEnvelopeData } from '@/services/chat/chatUnreadPayload';
import { useChatSyncStore, ChatContextType } from '@/store/chatSyncStore';
import type { ChatType } from '@/types';
import { normalizeChatType } from '@/utils/chatType';

const ALL_GAME_CHAT_TYPES: ChatType[] = ['PUBLIC', 'PRIVATE', 'ADMINS', 'PHOTOS'];

export interface ChatRoomRef {
  contextType: ChatContextType;
  contextId: string;
  gameChatType?: ChatType;
}

export const chatSyncService = {
  async syncContext(
    contextType: ChatContextType,
    contextId: string,
    gameChatType?: ChatType
  ): Promise<void> {
    if (contextType === 'GAME' && !gameChatType) {
      for (const ct of ALL_GAME_CHAT_TYPES) {
        const normalized = normalizeChatType(ct);
        try {
          const messages = await pullMissedAndPersistToDexie({
            contextType,
            contextId,
            gameChatType: normalized,
          });
          if (messages.length > 0) {
            useChatSyncStore.getState().addMissedMessages(contextType, contextId, messages, normalized);
          }
        } catch (err) {
          console.error(`[chatSync] syncContext ${contextType}:${contextId}:${normalized} failed:`, err);
        }
      }
      return;
    }

    try {
      const messages = await pullMissedAndPersistToDexie({
        contextType,
        contextId,
        gameChatType,
      });
      if (messages.length > 0) {
        useChatSyncStore.getState().addMissedMessages(contextType, contextId, messages, gameChatType);
      }
    } catch (err) {
      console.error(`[chatSync] syncContext ${contextType}:${contextId} failed:`, err);
    }
  },

  async syncAllContexts(rooms: ChatRoomRef[]): Promise<void> {
    if (rooms.length === 0) return;
    const { setSyncInProgress, setLastSyncCompletedAt } = useChatSyncStore.getState();
    setSyncInProgress(true);
    refreshChatOfflineBanner();
    try {
      for (const r of rooms) {
        enqueueChatSyncPull(r.contextType, r.contextId, SYNC_PRIORITY_FOREGROUND);
      }
      await Promise.all(
        rooms.map((r) => this.syncContext(r.contextType, r.contextId, r.gameChatType))
      );
      chatApi.invalidateUnreadCache();
      try {
        const res = await chatApi.getUnreadObjects();
        scheduleWarmFromUnreadApiPayload(unreadApiEnvelopeData(res));
      } catch {
        // list will refetch when opened
      }
    } finally {
      setSyncInProgress(false);
      setLastSyncCompletedAt(Date.now());
      refreshChatOfflineBanner();
    }
  },

  invalidateUnread: () => {
    chatApi.invalidateUnreadCache();
  },

  async refreshUnreadAndList(): Promise<void> {
    chatApi.invalidateUnreadCache();
    try {
      const res = await chatApi.getUnreadObjects();
      scheduleWarmFromUnreadApiPayload(unreadApiEnvelopeData(res));
    } catch {
      // list will refetch when opened
    }
    useChatSyncStore.getState().setLastSyncCompletedAt(Date.now());
  },
};
