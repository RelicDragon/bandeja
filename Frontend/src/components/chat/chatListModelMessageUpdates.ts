import { calculateLastMessageDate } from '@/utils/chatListHelpers';
import { sortChatItems } from '@/utils/chatListSort';
import { usePlayersStore } from '@/store/playersStore';
import type { ChatDraft, ChatMessage } from '@/api/chat';
import type { ChatItem } from './chatListTypes';

export function updateChatDraftInList(
  prevChats: ChatItem[],
  chatContextType: string,
  contextId: string,
  draft: ChatDraft | null,
  chatsFilter: string,
  userId: string | undefined
): ChatItem[] {
  const updatedChats = prevChats.map((chat) => {
    if (chat.type === 'user' && chatContextType === 'USER' && chat.data.id === contextId) {
      const lastMessageDate = (chat.data.lastMessage || draft)
        ? calculateLastMessageDate(chat.data.lastMessage, draft, chat.data.updatedAt)
        : null;
      return { ...chat, draft, lastMessageDate };
    }
    if (chat.type === 'group' && chatContextType === 'GROUP' && chat.data.id === contextId) {
      const lastMessageDate = (chat.data.lastMessage || draft)
        ? calculateLastMessageDate(chat.data.lastMessage, draft, chat.data.updatedAt)
        : null;
      return { ...chat, draft, lastMessageDate };
    }
    if (chat.type === 'channel' && chatContextType === 'GROUP' && chat.data.id === contextId) {
      const lastMessageDate = (chat.data.lastMessage || draft)
        ? calculateLastMessageDate(chat.data.lastMessage, draft, chat.data.updatedAt)
        : chat.lastMessageDate;
      return { ...chat, draft: draft ?? null, lastMessageDate };
    }
    return chat;
  });
  if (chatsFilter === 'users') return sortChatItems(updatedChats, 'users', userId);
  return updatedChats;
}

export function updateChatMessageInList(
  prevChats: ChatItem[],
  chatContextType: string,
  contextId: string,
  message: ChatMessage,
  chatsFilter: string,
  userId: string | undefined
): ChatItem[] {
  const { chats: storeChats, unreadCounts } = usePlayersStore.getState();
  const updatedChats = prevChats.map((chat) => {
    if (chat.type === 'user' && chatContextType === 'USER' && chat.data.id === contextId) {
      const fromStore = storeChats[contextId];
      const updatedChat = fromStore
        ? { ...chat.data, ...fromStore, isPinned: fromStore.isPinned ?? chat.data.isPinned }
        : chat.data;
      const d = chat.draft || null;
      const lastMessageDate = ((updatedChat.lastMessage || message) || d)
        ? calculateLastMessageDate(updatedChat.lastMessage || message, d, updatedChat.updatedAt)
        : null;
      return {
        ...chat,
        data: updatedChat,
        unreadCount: unreadCounts[contextId] || chat.unreadCount || 0,
        lastMessageDate,
      };
    }
    if ((chat.type === 'group' || chat.type === 'channel') && chatContextType === 'GROUP' && chat.data.id === contextId) {
      const d = chat.type === 'group' ? (chat.draft || null) : null;
      const lastMessageDate = (message || d)
        ? calculateLastMessageDate(message, d, new Date().toISOString())
        : null;
      return {
        ...chat,
        data: { ...chat.data, lastMessage: message, updatedAt: new Date().toISOString() },
        lastMessageDate,
      };
    }
    return chat;
  });
  if (chatsFilter === 'users') return sortChatItems(updatedChats, 'users', userId);
  if (chatsFilter === 'bugs' || chatsFilter === 'channels') return sortChatItems(updatedChats, chatsFilter);
  return updatedChats;
}
