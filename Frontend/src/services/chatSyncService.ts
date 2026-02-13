import { chatApi } from '@/api/chat';
import { useChatSyncStore, ChatContextType } from '@/store/chatSyncStore';

export interface ChatRoomRef {
  contextType: ChatContextType;
  contextId: string;
}

export const chatSyncService = {
  async syncContext(contextType: ChatContextType, contextId: string): Promise<void> {
    const lastMessageId = useChatSyncStore.getState().getLastMessageId(contextType, contextId);
    try {
      const messages = await chatApi.getMissedMessages(contextType, contextId, lastMessageId ?? undefined);
      if (messages.length > 0) {
        useChatSyncStore.getState().addMissedMessages(contextType, contextId, messages);
      }
    } catch (err) {
      console.error(`[chatSync] syncContext ${contextType}:${contextId} failed:`, err);
    }
  },

  async syncAllContexts(rooms: ChatRoomRef[]): Promise<void> {
    if (rooms.length === 0) return;
    const { setSyncInProgress, setLastSyncCompletedAt } = useChatSyncStore.getState();
    setSyncInProgress(true);
    try {
      await Promise.all(rooms.map((r) => this.syncContext(r.contextType, r.contextId)));
      chatApi.invalidateUnreadCache();
      try {
        await chatApi.getUnreadObjects();
      } catch {
        // list will refetch when opened
      }
    } finally {
      setSyncInProgress(false);
      setLastSyncCompletedAt(Date.now());
    }
  },

  invalidateUnread: () => {
    chatApi.invalidateUnreadCache();
  },

  async refreshUnreadAndList(): Promise<void> {
    chatApi.invalidateUnreadCache();
    try {
      await chatApi.getUnreadObjects();
    } catch {
      // list will refetch when opened
    }
    useChatSyncStore.getState().setLastSyncCompletedAt(Date.now());
  },
};
