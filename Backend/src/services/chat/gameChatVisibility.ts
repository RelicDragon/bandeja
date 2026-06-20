import { ChatType } from '@prisma/client';

export function canParticipantSeeGameChatMessage(
  participant: { status: string; role: string } | undefined,
  game: { status: string },
  chatType: ChatType,
  isParentGameAdminOrOwner = false
): boolean {
  if (chatType === ChatType.PUBLIC) return true;
  if (chatType === ChatType.PRIVATE) {
    return participant?.status === 'PLAYING' || participant?.status === 'NON_PLAYING';
  }
  if (chatType === ChatType.ADMINS) return (participant?.role === 'OWNER' || participant?.role === 'ADMIN') || isParentGameAdminOrOwner;
  return false;
}

export function shouldNotifyParentGameAdminForMessage(
  parentUserId: string,
  message: { mentionIds?: string[]; replyTo?: { sender?: { id?: string } } | null }
): boolean {
  if ((message.mentionIds ?? []).includes(parentUserId)) return true;
  return message.replyTo?.sender?.id === parentUserId;
}
