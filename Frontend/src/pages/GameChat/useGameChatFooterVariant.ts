import { useMemo } from 'react';
import { chatApi } from '@/api/chat';
import type { ChatContextType } from '@/api/chat';
import type { ChatMessageWithStatus } from '@/api/chat';
import type { Game, Bug } from '@/types';
import type { GroupChannel } from '@/api/chat';
import type { GameChatFooterVariant } from './GameChatFooter';

export interface UseGameChatFooterVariantParams {
  id: string | undefined;
  contextType: ChatContextType;
  isBlockedByUser: boolean;
  userChat: { id?: string; user1Id: string; user2Id: string; user1?: { allowMessagesFromNonContacts?: boolean }; user2?: { allowMessagesFromNonContacts?: boolean }; user1allowed?: boolean; user2allowed?: boolean } | null;
  userId: string | undefined;
  messagesLength: number;
  canAccessChat: boolean;
  canWriteChat: boolean;
  isChannelParticipantOnly: boolean;
  game: Game | null;
  bug: Bug | null;
  groupChannel: GroupChannel | null;
  isInJoinQueue: boolean;
  isChannelParticipant: boolean;
  isPlayingParticipant: boolean;
  isAdminOrOwner: boolean;
  isChannel: boolean;
  isJoiningAsGuest: boolean;
  currentChatType: string;
  translateToLanguageForChat: string | null;
  setUserChat: React.Dispatch<React.SetStateAction<import('@/api/chat').UserChat | null>>;
  setTranslateToLanguageForChat: (v: string | null) => void;
  loadContext: () => Promise<unknown>;
  handleAddOptimisticMessage: (payload: import('@/api/chat').OptimisticMessagePayload) => string;
  handleSendQueued: (params: any) => void;
  handleSendFailed: (optimisticId: string) => void;
  handleReplaceOptimisticWithServerMessage: (optimisticId: string, serverMessage: import('@/api/chat').ChatMessage) => void;
  replyTo: ChatMessageWithStatus | null;
  handleCancelReply: () => void;
  editingMessage: ChatMessageWithStatus | null;
  handleCancelEdit: () => void;
  handleMessageUpdated: (updated: ChatMessageWithStatus) => void;
  lastOwnMessage: ChatMessageWithStatus | null;
  handleEditMessage: (message: ChatMessageWithStatus) => void;
  handleScrollToMessage: (messageId: string) => void;
  handleJoinAsGuest: () => void;
}

export function useGameChatFooterVariant(params: UseGameChatFooterVariantParams): GameChatFooterVariant | null {
  const {
    id,
    contextType,
    isBlockedByUser,
    userChat,
    userId,
    messagesLength,
    canAccessChat,
    canWriteChat,
    isChannelParticipantOnly,
    game,
    bug,
    groupChannel,
    isInJoinQueue,
    isChannelParticipant,
    isPlayingParticipant,
    isAdminOrOwner,
    isChannel,
    isJoiningAsGuest,
    currentChatType,
    translateToLanguageForChat,
    setUserChat,
    setTranslateToLanguageForChat,
    loadContext,
    handleAddOptimisticMessage,
    handleSendQueued,
    handleSendFailed,
    handleReplaceOptimisticWithServerMessage,
    replyTo,
    handleCancelReply,
    editingMessage,
    handleCancelEdit,
    handleMessageUpdated,
    lastOwnMessage,
    handleEditMessage,
    handleScrollToMessage,
    handleJoinAsGuest,
  } = params;

  return useMemo((): GameChatFooterVariant | null => {
    if (isBlockedByUser && contextType === 'USER') return { type: 'blocked' };
    if (contextType === 'USER' && userChat && userId) {
      const chatId = id ?? userChat.id;
      const otherUser = userId === userChat.user1Id ? userChat.user2 : userChat.user1;
      const otherSideAllowed = userId === userChat.user1Id ? userChat.user2allowed : userChat.user1allowed;
      const otherAllowsNonContacts = otherUser?.allowMessagesFromNonContacts !== false;
      if (chatId && !otherSideAllowed && !otherAllowsNonContacts) {
        return {
          type: 'request',
          userChatId: chatId,
          disabled: messagesLength > 0,
          onUserChatUpdate: (uc) => setUserChat((prev) => (prev ? { ...prev, ...uc } : null)),
        };
      }
    }
    if (canAccessChat && canWriteChat && !isChannelParticipantOnly) {
      return {
        type: 'input',
        gameId: contextType === 'GAME' ? id : undefined,
        userChatId: contextType === 'USER' ? (id || userChat?.id) : undefined,
        groupChannelId: contextType === 'GROUP' ? id : undefined,
        game: game ?? null,
        bug: bug ?? null,
        groupChannel: groupChannel ?? null,
        onOptimisticMessage: handleAddOptimisticMessage,
        onSendQueued: handleSendQueued,
        onSendFailed: handleSendFailed,
        onMessageCreated: handleReplaceOptimisticWithServerMessage,
        replyTo,
        onCancelReply: handleCancelReply,
        editingMessage,
        onCancelEdit: handleCancelEdit,
        onEditMessage: handleMessageUpdated,
        lastOwnMessage,
        onStartEditMessage: handleEditMessage,
        onScrollToMessage: handleScrollToMessage,
        chatType: currentChatType,
        onGroupChannelUpdate: contextType === 'GROUP' ? () => { void loadContext(); } : undefined,
        contextType,
        contextId: id ?? '',
        translateToLanguage: translateToLanguageForChat,
        onTranslateToLanguageChange: async (value) => {
          if (!id) return;
          await chatApi.setChatTranslationPreference(contextType, id, value);
          setTranslateToLanguageForChat(value);
        },
      };
    }
    const showJoin =
      !(contextType === 'GAME' && isInJoinQueue) &&
      !(contextType === 'GAME' && game && (game.status === 'FINISHED' || game.status === 'ARCHIVED')) &&
      !(contextType === 'GROUP' && isChannelParticipant) &&
      !(contextType === 'GAME' && currentChatType === 'PHOTOS' && !isPlayingParticipant && !isAdminOrOwner);
    if (showJoin) {
      return {
        type: 'join',
        contextType,
        groupChannel: groupChannel ?? null,
        isChannel: !!isChannel,
        onJoin: handleJoinAsGuest,
        isLoading: isJoiningAsGuest,
      };
    }
    return null;
  }, [
    isBlockedByUser,
    contextType,
    userChat,
    userId,
    id,
    messagesLength,
    canAccessChat,
    canWriteChat,
    isChannelParticipantOnly,
    game,
    bug,
    groupChannel,
    handleAddOptimisticMessage,
    handleSendQueued,
    handleSendFailed,
    handleReplaceOptimisticWithServerMessage,
    replyTo,
    handleCancelReply,
    editingMessage,
    handleCancelEdit,
    handleMessageUpdated,
    lastOwnMessage,
    handleEditMessage,
    handleScrollToMessage,
    currentChatType,
    loadContext,
    translateToLanguageForChat,
    isInJoinQueue,
    isChannelParticipant,
    isPlayingParticipant,
    isAdminOrOwner,
    isChannel,
    handleJoinAsGuest,
    isJoiningAsGuest,
    setUserChat,
    setTranslateToLanguageForChat,
  ]);
}
