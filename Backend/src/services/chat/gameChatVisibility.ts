import { ChatType } from '@prisma/client';

export function canParticipantSeeGameChatMessage(
  participant: { status: string; role: string } | undefined,
  game: { status: string },
  chatType: ChatType,
  isParentGameAdminOrOwner = false
): boolean {
  if (chatType === ChatType.PUBLIC) return true;
  if (chatType === ChatType.PRIVATE) return participant?.status === 'PLAYING';
  if (chatType === ChatType.ADMINS) return (participant?.role === 'OWNER' || participant?.role === 'ADMIN') || isParentGameAdminOrOwner;
  if (chatType === ChatType.PHOTOS) return game.status !== 'ANNOUNCED';
  return false;
}
