import { ChatType } from '@/types';

export const normalizeChatType = (chatType: ChatType): ChatType => {
  return chatType;
};

export function getAvailableGameChatTypes(
  game: { status?: string },
  participant?: { status: string; role: string } | null
): ChatType[] {
  const types: ChatType[] = [];
  if (game?.status && game.status !== 'ANNOUNCED') types.push('PHOTOS');
  types.push('PUBLIC');
  if (participant?.status === 'PLAYING') types.push('PRIVATE');
  if (participant && (participant.role === 'OWNER' || participant.role === 'ADMIN')) types.push('ADMINS');
  return types;
}
