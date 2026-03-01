import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getGameParticipationState } from '@/utils/gameParticipationState';
import { isGroupChannelOwner, isGroupChannelAdminOrOwner } from '@/utils/gameResults';
import { getAvailableGameChatTypes } from '@/utils/chatType';
import type { ChatContextType } from '@/api/chat';
import type { ChatType } from '@/types';
import type { Game } from '@/types';
import type { GroupChannel } from '@/api/chat';
import type { ChatMessageWithStatus } from '@/api/chat';

export interface UseGameChatDerivedParams {
  game: Game | null;
  groupChannel: GroupChannel | null;
  user: { id: string } | null;
  contextType: ChatContextType;
  currentChatType: ChatType;
  messages: ChatMessageWithStatus[];
}

export function useGameChatDerived({
  game,
  groupChannel,
  user,
  contextType,
  currentChatType,
  messages,
}: UseGameChatDerivedParams) {
  const { t } = useTranslation();
  const participation = getGameParticipationState(game?.participants ?? [], user?.id, game ?? undefined);
  const { userParticipant, isParticipant, isPlaying: isPlayingParticipant, isAdminOrOwner, hasPendingInvite, isGuest, isInJoinQueue } = participation;

  const isBugChat = contextType === 'GROUP' && !!groupChannel?.bug;
  const isBugCreator = groupChannel?.bug?.senderId === user?.id;
  const isBugAdmin = user ? (user as { isAdmin?: boolean }).isAdmin : false;
  const isBugParticipant = groupChannel?.participants?.some((p) => p.userId === user?.id) ?? false;
  const isBugChatParticipant = isBugChat && !!groupChannel?.bug && (isBugParticipant || isBugCreator || isBugAdmin);

  const isChannelOwner = contextType === 'GROUP' && groupChannel && user ? isGroupChannelOwner(groupChannel, user.id) : false;
  const isChannelAdminOrOwner = contextType === 'GROUP' && groupChannel && user ? isGroupChannelAdminOrOwner(groupChannel, user.id) : false;
  const isChannelParticipant = contextType === 'GROUP' && groupChannel && (groupChannel.isParticipant || isChannelOwner);
  const isChannel = contextType === 'GROUP' && !!groupChannel?.isChannel;
  const isChannelParticipantOnly = isChannel && isChannelParticipant && !isChannelAdminOrOwner;
  const isItemChat = contextType === 'GROUP' && !!groupChannel?.marketItem;

  const showMute = !!(
    (contextType === 'GAME' && isParticipant) ||
    isBugChatParticipant ||
    contextType === 'USER' ||
    (contextType === 'GROUP' && groupChannel && isChannelParticipant)
  );

  const showLeave = !!(
    (contextType === 'GAME' && isParticipant && isGuest && game?.entityType !== 'LEAGUE') ||
    (isBugChatParticipant && !isBugCreator) ||
    (contextType === 'GROUP' && groupChannel && !isBugChat && isChannelParticipant && !isChannelOwner)
  );

  const showHeaderActions = showMute || showLeave || contextType === 'GAME';

  const leaveTitle = useMemo(() => {
    if (contextType === 'GROUP' && groupChannel) {
      return groupChannel.isChannel
        ? t('chat.leaveChannel', { defaultValue: 'Leave Channel' })
        : t('chat.leaveGroup', { defaultValue: 'Leave Group' });
    }
    return t('chat.leave');
  }, [contextType, groupChannel, t]);

  const canWriteGroupChat = useMemo(() => {
    if (contextType !== 'GROUP' || !groupChannel || !user?.id) return false;
    if (isChannel) return isChannelAdminOrOwner;
    return isChannelParticipant;
  }, [contextType, groupChannel, user?.id, isChannel, isChannelAdminOrOwner, isChannelParticipant]);

  const parentParticipantEntry = game?.parent?.participants?.find(p => p.userId === user?.id);
  const isParentAdminOrOwner = parentParticipantEntry?.role === 'OWNER' || parentParticipantEntry?.role === 'ADMIN';
  const isParentParticipant = !!parentParticipantEntry;
  const hasPrivateAccess = isPlayingParticipant || userParticipant?.status === 'NON_PLAYING' || isAdminOrOwner || isParentAdminOrOwner;
  const hasAdminsAccess = isAdminOrOwner || isParentAdminOrOwner;

  const canAccessChat = contextType === 'USER' ||
    (contextType === 'GAME' && (
      currentChatType === 'PUBLIC' ||
      currentChatType === 'PHOTOS' ||
      (currentChatType === 'PRIVATE' && hasPrivateAccess) ||
      (currentChatType === 'ADMINS' && hasAdminsAccess) ||
      isParticipant ||
      hasPendingInvite ||
      isGuest ||
      isAdminOrOwner
    )) ||
    (contextType === 'GROUP' && (isChannelParticipant || (isChannel && !!groupChannel?.isPublic)));

  const canWriteGameChat = useMemo(() => {
    if (contextType !== 'GAME' || !game || !user?.id) return false;
    if (currentChatType === 'PUBLIC') return isParticipant || isAdminOrOwner || isParentParticipant;
    if (currentChatType === 'ADMINS') return hasAdminsAccess;
    if (currentChatType === 'PRIVATE') return hasPrivateAccess;
    if (currentChatType === 'PHOTOS') return isPlayingParticipant || isAdminOrOwner;
    return false;
  }, [contextType, game, user?.id, currentChatType, isParticipant, isAdminOrOwner, isPlayingParticipant, isParentParticipant, hasPrivateAccess, hasAdminsAccess]);

  const canWriteChat = useMemo(() => {
    if (contextType === 'GAME') return canWriteGameChat;
    if (contextType === 'GROUP') return canWriteGroupChat;
    if (contextType === 'USER') return true;
    return false;
  }, [contextType, canWriteGameChat, canWriteGroupChat]);

  const lastOwnMessage = useMemo(() => {
    if (!user?.id || messages.length === 0) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].senderId === user.id) return messages[i];
    }
    return null;
  }, [user?.id, messages]);

  const canViewPublicChat = contextType === 'USER' || contextType === 'GROUP' || (contextType === 'GAME' && currentChatType === 'PUBLIC') || canAccessChat;

  const availableChatTypes = useMemo((): ChatType[] => {
    if (contextType !== 'GAME') return ['PUBLIC'];
    const participant = game?.participants?.find(p => p.userId === user?.id);
    const parentParticipant = game?.parent?.participants?.find(p => p.userId === user?.id);
    return getAvailableGameChatTypes(game ?? { status: undefined }, participant ?? undefined, parentParticipant ?? undefined);
  }, [contextType, game, user?.id]);

  return {
    participation,
    userParticipant,
    isParticipant,
    isPlayingParticipant,
    isAdminOrOwner,
    hasPendingInvite,
    isGuest,
    isInJoinQueue,
    isBugChat,
    isBugCreator,
    isBugAdmin,
    isBugChatParticipant,
    isChannelOwner,
    isChannelAdminOrOwner,
    isChannelParticipant,
    isChannel,
    isChannelParticipantOnly,
    isItemChat,
    showMute,
    showLeave,
    showHeaderActions,
    leaveTitle,
    canWriteGroupChat,
    canWriteGameChat,
    canWriteChat,
    canAccessChat,
    canViewPublicChat,
    lastOwnMessage,
    availableChatTypes,
  };
}
