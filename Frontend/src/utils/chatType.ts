import { ChatType } from '@/types';
import {
  filterGameChatTypesByChannelActivity,
  type GameChatChannelActivity,
} from '@/utils/gameChatChannelActivity';

/** Legacy game gallery tab removed; map old PHOTOS deep links and payloads to PUBLIC. */
export const normalizeChatType = (chatType: ChatType | string): ChatType => {
  if (String(chatType).toUpperCase() === 'PHOTOS') return 'PUBLIC';
  return chatType as ChatType;
};

export function getAvailableGameChatTypes(
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
  participant?: { status: string; role: string } | null,
  parentParticipant?: { role: string } | null,
  channelActivity?: GameChatChannelActivity
): ChatType[] {
  const types = getAvailableGameChatTypes(participant, parentParticipant);
  if (!channelActivity) return types;
  return filterGameChatTypesByChannelActivity(types, channelActivity);
}
