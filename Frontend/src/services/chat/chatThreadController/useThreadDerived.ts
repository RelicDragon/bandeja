import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getGameParticipationState } from '@/utils/gameParticipationState';
import { isGroupChannelOwner, isGroupChannelAdminOrOwner } from '@/utils/gameResults';
import { isUserGroupChannelParticipant } from '@/utils/groupChannelParticipation';
import { getVisibleGameChatTypes } from '@/utils/chatType';
import type { GameChatChannelActivity } from '@/utils/gameChatChannelActivity';
import type { ChatContextType } from '@/api/chat';
import type { ChatType } from '@/types';
import type { Game } from '@/types';
import type { GroupChannel } from '@/api/chat';
import type { ChatMessageWithStatus } from '@/api/chat';

function getLastOwnMessageIdentity(
  messages: ChatMessageWithStatus[],
  userId: string | undefined,
): string | null {
  if (!userId || messages.length === 0) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.senderId === userId) {
      return `${m.id ?? ''}\0${m._optimisticId ?? ''}\0${i}`;
    }
  }
  return null;
}

export interface UseThreadDerivedParams {
  game: Game | null;
  groupChannel: GroupChannel | null;
  user: { id: string } | null;
  contextType: ChatContextType;
  currentChatType: ChatType;
  messages: ChatMessageWithStatus[];
  channelActivity?: GameChatChannelActivity;
  isGameChatArchived?: boolean;
}

export function useThreadDerived({
  game,
  groupChannel,
  user,
  contextType,
  currentChatType,
  messages,
  channelActivity,
  isGameChatArchived = false,
}: UseThreadDerivedParams) {
  const { t } = useTranslation();
  const participation = useMemo(
    () => getGameParticipationState(game?.participants ?? [], user?.id, game ?? undefined),
    [game, user?.id],
  );
  const { userParticipant, isParticipant, isPlaying: isPlayingParticipant, isAdminOrOwner, hasPendingInvite, isGuest, isInJoinQueue } = participation;

  const isBugChat = contextType === 'GROUP' && !!groupChannel?.bug;
  const isBugCreator = groupChannel?.bug?.senderId === user?.id;
  const isBugAdmin = user ? (user as { isAdmin?: boolean }).isAdmin : false;
  const canEditBug = isBugAdmin || isBugCreator;
  const isBugParticipant = groupChannel?.participants?.some((p) => p.userId === user?.id) ?? false;
  const isBugChatParticipant = isBugChat && !!groupChannel?.bug && (isBugParticipant || isBugCreator || isBugAdmin);

  const isChannelOwner = contextType === 'GROUP' && groupChannel && user ? isGroupChannelOwner(groupChannel, user.id) : false;
  const isChannelAdminOrOwner = contextType === 'GROUP' && groupChannel && user ? isGroupChannelAdminOrOwner(groupChannel, user.id) : false;
  const isChannelParticipant =
    contextType === 'GROUP' && groupChannel && user
      ? isUserGroupChannelParticipant(groupChannel, user.id)
      : false;
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
    return false;
  }, [contextType, game, user?.id, currentChatType, isParticipant, isAdminOrOwner, isParentParticipant, hasPrivateAccess, hasAdminsAccess]);

  const canWriteChat = useMemo(() => {
    if (isGameChatArchived) return false;
    if (contextType === 'GAME') return canWriteGameChat;
    if (contextType === 'GROUP') return canWriteGroupChat;
    if (contextType === 'USER') return true;
    return false;
  }, [isGameChatArchived, contextType, canWriteGameChat, canWriteGroupChat]);

  const lastOwnMessageIdentity = getLastOwnMessageIdentity(messages, user?.id);

  const lastOwnMessage = useMemo(() => {
    if (!lastOwnMessageIdentity || !user?.id) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].senderId === user.id) return messages[i];
    }
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- identity key gates refresh; full messages would bust chrome on every patch
  }, [user?.id, lastOwnMessageIdentity]);

  const canViewPublicChat = contextType === 'USER' || contextType === 'GROUP' || (contextType === 'GAME' && currentChatType === 'PUBLIC') || canAccessChat;

  const availableChatTypes = useMemo((): ChatType[] => {
    if (contextType !== 'GAME') return ['PUBLIC'];
    const participant = game?.participants?.find(p => p.userId === user?.id);
    const parentParticipant = game?.parent?.participants?.find(p => p.userId === user?.id);
    return getVisibleGameChatTypes(
      participant ?? undefined,
      parentParticipant ?? undefined,
      channelActivity
    );
  }, [contextType, game, user?.id, channelActivity]);

  return useMemo(
    () => ({
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
      canEditBug,
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
      isGameChatArchived,
    }),
    [
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
      canEditBug,
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
      isGameChatArchived,
    ],
  );
}
