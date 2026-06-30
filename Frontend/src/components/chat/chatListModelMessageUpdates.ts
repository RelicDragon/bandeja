import { calculateLastMessageDate } from '@/utils/chatListHelpers';
import { sortChatItems } from '@/utils/chatListSort';
import { usePlayersStore } from '@/store/playersStore';
import { isUnreadStoreWarm, selectContextUnread, useUnreadStore } from '@/store/unreadStore';
import type { ChatDraft, ChatMessage, GroupChannel } from '@/api/chat';
import type { ChatItem } from './chatListTypes';
import type { Game } from '@/types';
import {
  chatMessageToGameListPreview,
  isGamePublicListPreviewMessage,
} from '@/utils/gameChatListPreview';

function groupChannelMatchesBugContext(data: GroupChannel, bugId: string): boolean {
  return data.bug?.id === bugId || data.bugId === bugId;
}

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
    if (chat.type === 'group' && chatContextType === 'BUG' && groupChannelMatchesBugContext(chat.data, contextId)) {
      const lastMessageDate = (chat.data.lastMessage || draft)
        ? calculateLastMessageDate(chat.data.lastMessage, draft, chat.data.updatedAt)
        : null;
      return { ...chat, draft, lastMessageDate };
    }
    if (chat.type === 'channel' && chatContextType === 'BUG' && groupChannelMatchesBugContext(chat.data, contextId)) {
      const lastMessageDate = (chat.data.lastMessage || draft)
        ? calculateLastMessageDate(chat.data.lastMessage, draft, chat.data.updatedAt)
        : chat.lastMessageDate;
      return { ...chat, draft: draft ?? null, lastMessageDate };
    }
    if (chat.type === 'game' && chatContextType === 'GAME' && chat.data.id === contextId) {
      const lastMessageDate = (chat.data.lastMessage || draft)
        ? calculateLastMessageDate(chat.data.lastMessage, draft, chat.data.updatedAt)
        : null;
      return { ...chat, draft, lastMessageDate };
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
  const { chats: storeChats } = usePlayersStore.getState();
  const unreadWarm = isUnreadStoreWarm(useUnreadStore.getState());
  const updatedChats = prevChats.map((chat) => {
    if (chat.type === 'user' && chatContextType === 'USER' && chat.data.id === contextId) {
      const fromStore = storeChats[contextId];
      const merged = fromStore
        ? { ...chat.data, ...fromStore, isPinned: fromStore.isPinned ?? chat.data.isPinned }
        : chat.data;
      const updatedAtIso = message.updatedAt ?? message.createdAt;
      const updatedChat = {
        ...merged,
        lastMessage: message,
        updatedAt: updatedAtIso,
      };
      const d = chat.draft || null;
      const lastMessageDate = (message || d)
        ? calculateLastMessageDate(message, d, updatedChat.updatedAt)
        : null;
      const unreadCount = unreadWarm
        ? selectContextUnread('USER', contextId)
        : chat.unreadCount || 0;
      return {
        ...chat,
        data: updatedChat,
        unreadCount,
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
    if (
      (chat.type === 'group' || chat.type === 'channel') &&
      chatContextType === 'BUG' &&
      groupChannelMatchesBugContext(chat.data, contextId)
    ) {
      const d = chat.type === 'group' ? (chat.draft || null) : null;
      const updatedAtIso = message.updatedAt ?? message.createdAt;
      const lastMessageDate = (message || d)
        ? calculateLastMessageDate(message, d, updatedAtIso)
        : null;
      return {
        ...chat,
        data: { ...chat.data, lastMessage: message, updatedAt: updatedAtIso },
        lastMessageDate,
      };
    }
    if (chat.type === 'game' && chatContextType === 'GAME' && chat.data.id === contextId) {
      if (!isGamePublicListPreviewMessage(message)) return chat;
      const updatedAtIso = message.updatedAt ?? message.createdAt;
      const lastMessage = chatMessageToGameListPreview(message);
      const updatedGame: Game = {
        ...chat.data,
        lastMessage,
        updatedAt: updatedAtIso,
      };
      const d = chat.draft ?? null;
      const lastMessageDate = calculateLastMessageDate(lastMessage, d, updatedAtIso);
      return {
        ...chat,
        data: updatedGame,
        lastMessageDate,
      };
    }
    return chat;
  });
  if (chatsFilter === 'users') return sortChatItems(updatedChats, 'users', userId);
  if (chatsFilter === 'bugs' || chatsFilter === 'channels') return sortChatItems(updatedChats, chatsFilter);
  return updatedChats;
}
