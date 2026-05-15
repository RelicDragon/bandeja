import type { ChatContextType, GroupChannel, UserChat } from '@/api/chat';
import type { Game, Bug, BasicUser, ChatType } from '@/types';
import { normalizeChatType } from '@/utils/chatType';
import { isPendingGameInvite } from '@/utils/gameInviteParticipant';

export function formatBasicUserDisplayName(u: BasicUser | undefined | null): string {
  if (!u) return '';
  return [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
}

function addUser(map: Map<string, BasicUser>, user: BasicUser | undefined | null) {
  if (user?.id) map.set(user.id, user);
}

function addGameParticipants(
  map: Map<string, BasicUser>,
  game: Game,
  chatType: ChatType | string | undefined
) {
  const normalizedChatType = chatType ? normalizeChatType(chatType as ChatType) : 'PUBLIC';
  const userIds = new Set<string>();

  const push = (user: BasicUser | undefined) => {
    if (user && !userIds.has(user.id)) {
      userIds.add(user.id);
      addUser(map, user);
    }
  };

  if (normalizedChatType === 'PUBLIC') {
    game.participants?.forEach((p) => push(p.user));
    game.participants?.filter((p) => isPendingGameInvite(p)).forEach((p) => push(p.user));
    game.parent?.participants
      ?.filter((p) => p.role === 'ADMIN' || p.role === 'OWNER')
      .forEach((p) => push(p.user));
  } else if (normalizedChatType === 'ADMINS') {
    game.participants
      ?.filter((p) => p.role === 'ADMIN' || p.role === 'OWNER')
      .forEach((p) => push(p.user));
    game.parent?.participants
      ?.filter((p) => p.role === 'ADMIN' || p.role === 'OWNER')
      .forEach((p) => push(p.user));
  } else if (normalizedChatType === 'PRIVATE') {
    game.participants?.filter((p) => p.status === 'PLAYING').forEach((p) => push(p.user));
  } else if (normalizedChatType === 'PHOTOS') {
    game.participants?.forEach((p) => push(p.user));
    game.parent?.participants
      ?.filter((p) => p.role === 'ADMIN' || p.role === 'OWNER')
      .forEach((p) => push(p.user));
  }
}

export interface ChatContextUserLookupParams {
  contextType: ChatContextType;
  chatType?: string;
  game?: Game | null;
  bug?: Bug | null;
  groupChannel?: GroupChannel | null;
  userChat?: UserChat | null;
  currentUserId?: string;
}

export function buildChatContextUserMap(params: ChatContextUserLookupParams): Map<string, BasicUser> {
  const map = new Map<string, BasicUser>();
  const { contextType, game, bug, groupChannel, userChat, currentUserId, chatType } = params;

  if (contextType === 'GAME' && game) {
    addGameParticipants(map, game, chatType);
  } else if (contextType === 'BUG' && bug) {
    addUser(map, bug.sender);
    bug.participants?.forEach((p) => addUser(map, p.user));
  } else if (contextType === 'GROUP' && groupChannel) {
    groupChannel.participants?.forEach((p) => addUser(map, p.user));
    if (groupChannel.bug?.sender) addUser(map, groupChannel.bug.sender);
  } else if (contextType === 'USER' && userChat) {
    addUser(map, userChat.user1);
    addUser(map, userChat.user2);
    if (currentUserId) {
      const other = userChat.user1Id === currentUserId ? userChat.user2 : userChat.user1;
      addUser(map, other);
    }
  }

  return map;
}

export function resolveChatContextUser(
  userId: string,
  contextMap: Map<string, BasicUser>,
  storeUser: BasicUser | undefined
): BasicUser | undefined {
  return contextMap.get(userId) ?? storeUser;
}
