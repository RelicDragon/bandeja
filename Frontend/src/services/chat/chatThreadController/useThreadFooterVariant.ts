import { useMemo } from 'react';
import type { ChatContextType } from '@/api/chat';
import type { GameChatFooterVariant } from '@/pages/GameChat/GameChatFooter';

export interface UseThreadFooterVariantParams {
  id: string | undefined;
  contextType: ChatContextType;
  isBlockedByUser: boolean;
  userChat: { id?: string; user1Id: string; user2Id: string; user1?: { allowMessagesFromNonContacts?: boolean }; user2?: { allowMessagesFromNonContacts?: boolean }; user1allowed?: boolean; user2allowed?: boolean } | null;
  userId: string | undefined;
  canAccessChat: boolean;
  canWriteChat: boolean;
  isChannelParticipantOnly: boolean;
  game: import('@/types').Game | null;
  groupChannel: import('@/api/chat').GroupChannel | null;
  isInJoinQueue: boolean;
  isChannelParticipant: boolean;
  isChannel: boolean;
  isJoiningAsGuest: boolean;
}

export function useThreadFooterVariant(params: UseThreadFooterVariantParams): GameChatFooterVariant | null {
  const {
    contextType,
    isBlockedByUser,
    userChat,
    userId,
    id,
    canAccessChat,
    canWriteChat,
    isChannelParticipantOnly,
    game,
    groupChannel,
    isInJoinQueue,
    isChannelParticipant,
  } = params;

  return useMemo((): GameChatFooterVariant | null => {
    if (isBlockedByUser && contextType === 'USER') return { type: 'blocked' };
    if (contextType === 'USER' && userChat && userId) {
      const chatId = id ?? userChat.id;
      const otherUser = userId === userChat.user1Id ? userChat.user2 : userChat.user1;
      const otherSideAllowed = userId === userChat.user1Id ? userChat.user2allowed : userChat.user1allowed;
      const otherAllowsNonContacts = otherUser?.allowMessagesFromNonContacts !== false;
      if (chatId && !otherSideAllowed && !otherAllowsNonContacts) {
        return { type: 'request' };
      }
    }
    if (canAccessChat && canWriteChat && !isChannelParticipantOnly) {
      return { type: 'input' };
    }
    const showJoin =
      !(contextType === 'GAME' && isInJoinQueue) &&
      !(contextType === 'GAME' && game && (game.status === 'FINISHED' || game.status === 'ARCHIVED')) &&
      !(contextType === 'GROUP' && isChannelParticipant);
    if (showJoin) {
      if (contextType === 'GROUP' && !groupChannel) return { type: 'contextLoading' };
      if (contextType === 'GAME' && !game) return { type: 'contextLoading' };
      return { type: 'join' };
    }
    return null;
  }, [
    isBlockedByUser,
    contextType,
    userChat,
    userId,
    id,
    canAccessChat,
    canWriteChat,
    isChannelParticipantOnly,
    game,
    groupChannel,
    isInJoinQueue,
    isChannelParticipant,
  ]);
}
