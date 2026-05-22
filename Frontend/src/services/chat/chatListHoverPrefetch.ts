import type { ChatMessage } from '@/api/chat';
import { chatSyncTailKey } from '@/utils/chatSyncScope';
import { loadLocalThreadBootstrap } from '@/services/chat/chatLocalApply';
import { peekChatThreadMemory, putChatThreadMemory } from '@/services/chat/chatThreadMemoryCache';
import { preloadMessageRowHeights } from '@/services/chat/chatMessageHeights';
import type { ChatItem } from '@/components/chat/chatListTypes';

export async function prefetchChatThreadFromListHover(item: ChatItem): Promise<void> {
  if (item.type === 'user') {
    const key = chatSyncTailKey('USER', item.data.id);
    if (peekChatThreadMemory(key).length > 0) {
      void preloadMessageRowHeights(peekChatThreadMemory(key).map((m) => m.id));
      return;
    }
    const { messages } = await loadLocalThreadBootstrap('USER', item.data.id, 'PUBLIC');
    if (messages.length > 0) {
      putChatThreadMemory(key, messages);
      void preloadMessageRowHeights(messages.map((m) => m.id));
    }
    return;
  }

  if (item.type === 'group' || item.type === 'channel') {
    const channelId = item.data.id;
    const key = chatSyncTailKey('GROUP', channelId);
    if (peekChatThreadMemory(key).length > 0) {
      void preloadMessageRowHeights(peekChatThreadMemory(key).map((m) => m.id));
      return;
    }
    const { messages } = await loadLocalThreadBootstrap('GROUP', channelId, 'PUBLIC');
    if (messages.length > 0) {
      putChatThreadMemory(key, messages);
      void preloadMessageRowHeights(messages.map((m) => m.id));
    }
    return;
  }

  if (item.type === 'game') {
    const gameId = item.data.id;
    const key = chatSyncTailKey('GAME', gameId, 'PUBLIC');
    if (peekChatThreadMemory(key).length > 0) {
      void preloadMessageRowHeights(peekChatThreadMemory(key).map((m) => m.id));
      return;
    }
    const { messages } = await loadLocalThreadBootstrap('GAME', gameId, 'PUBLIC');
    if (messages.length > 0) {
      putChatThreadMemory(key, messages);
      void preloadMessageRowHeights(messages.map((m) => m.id));
    }
  }
}

export function prefetchLastMessageRowHeight(lastMessage: ChatMessage | null | undefined): void {
  if (!lastMessage?.id) return;
  void preloadMessageRowHeights([lastMessage.id]);
}
