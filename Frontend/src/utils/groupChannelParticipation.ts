import type { GroupChannel } from '@/api/chat';
import { isGroupChannelOwner } from '@/utils/gameResults';

/** Prefer fresh API payload but never downgrade local participant flag after join. */
export function mergeGroupChannelFromApi(prev: GroupChannel | null, next: GroupChannel): GroupChannel {
  if (prev?.id === next.id && prev.isParticipant && !next.isParticipant) {
    return { ...next, isParticipant: true };
  }
  return next;
}

export function isUserGroupChannelParticipant(
  groupChannel: GroupChannel,
  userId: string
): boolean {
  if (groupChannel.isParticipant) return true;
  if (isGroupChannelOwner(groupChannel, userId)) return true;
  return groupChannel.participants?.some((p) => p.userId === userId) ?? false;
}
