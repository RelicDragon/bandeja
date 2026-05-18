import { ChatType } from '@/types';
import {
  filterGameChatTypesByChannelActivity,
  type GameChatChannelActivity,
} from '@/utils/gameChatChannelActivity';

export const normalizeChatType = (chatType: ChatType): ChatType => {
  return chatType;
};

export function getAvailableGameChatTypes(
  game: { status?: string },
  participant?: { status: string; role: string } | null,
  parentParticipant?: { role: string } | null
): ChatType[] {
  const types: ChatType[] = ['PUBLIC'];

  const isAdminOrOwner = participant && (participant.role === 'OWNER' || participant.role === 'ADMIN');
  const isParentAdminOrOwner = parentParticipant && (parentParticipant.role === 'OWNER' || parentParticipant.role === 'ADMIN');

  if (
    participant?.status === 'PLAYING' ||
    participant?.status === 'NON_PLAYING' ||
    isAdminOrOwner ||
    isParentAdminOrOwner
  ) {
    types.push('PRIVATE');
  }

  if (isAdminOrOwner || isParentAdminOrOwner) {
    types.push('ADMINS');
  }

  return types;
}

export function getVisibleGameChatTypes(
  game: { status?: string },
  participant?: { status: string; role: string } | null,
  parentParticipant?: { role: string } | null,
  channelActivity?: GameChatChannelActivity
): ChatType[] {
  const types = getAvailableGameChatTypes(game, participant, parentParticipant);
  if (!channelActivity) return types;
  return filterGameChatTypesByChannelActivity(types, channelActivity);
}
