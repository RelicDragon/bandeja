import type { GroupChannel, UserChat } from '@/api/chat';

export function isTrustedUserChatOpenContext(
  chat: UserChat | null | undefined,
  routeChatId: string | undefined,
  currentUserId: string | undefined
): chat is UserChat {
  if (!chat || !routeChatId || chat.id !== routeChatId) return false;
  if (!chat.user1Id || !chat.user2Id) return false;
  if (!currentUserId) return false;
  if (chat.user1Id !== currentUserId && chat.user2Id !== currentUserId) return false;
  return true;
}

export function isTrustedGroupChannelOpenContext(
  ch: GroupChannel | null | undefined,
  routeChannelId: string | undefined,
  currentUserId: string | undefined
): ch is GroupChannel {
  if (!ch || !routeChannelId || ch.id !== routeChannelId) return false;
  if (typeof ch.name !== 'string') return false;
  if (ch.isParticipant === false) return false;
  if (currentUserId && Array.isArray(ch.participants) && ch.participants.length > 0) {
    const visible = ch.participants.filter((p) => !p.hidden);
    if (visible.length > 0 && !visible.some((p) => p.userId === currentUserId)) return false;
  }
  return true;
}
