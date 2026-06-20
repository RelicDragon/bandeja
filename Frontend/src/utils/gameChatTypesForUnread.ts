import type { ChatType } from '@/types';

export type GameChatParticipantForUnread = { status: string; role: string };
export type ParentParticipantForUnread = { role: string };

function resolveIsParentGameAdminOrOwner(
  parentParticipant?: ParentParticipantForUnread | null,
  isParentGameAdminOrOwner?: boolean
): boolean {
  if (isParentGameAdminOrOwner === true) return true;
  if (!parentParticipant) return false;
  return parentParticipant.role === 'OWNER' || parentParticipant.role === 'ADMIN';
}

/**
 * Mirrors Backend UnreadCountBatchService.buildGameChatTypeFilter exactly.
 * Do not use getAvailableGameChatTypes for unread / mark-read.
 */
export function getGameChatTypesForUnreadAndMarkRead(
  _game: { status: string },
  participant?: GameChatParticipantForUnread | null,
  parentParticipant?: ParentParticipantForUnread | null,
  isParentGameAdminOrOwner?: boolean
): ChatType[] {
  const parentAdmin = resolveIsParentGameAdminOrOwner(parentParticipant, isParentGameAdminOrOwner);
  const filter: ChatType[] = ['PUBLIC'];
  if (participant?.status === 'PLAYING' || participant?.status === 'NON_PLAYING') {
    filter.push('PRIVATE');
  }
  if (
    participant?.role === 'OWNER' ||
    participant?.role === 'ADMIN' ||
    parentAdmin
  ) {
    filter.push('ADMINS');
  }
  return filter;
}
