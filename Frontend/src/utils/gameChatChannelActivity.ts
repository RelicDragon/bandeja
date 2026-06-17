import type { ChatMessage } from '@/api/chat';
import type { ChatType } from '@/types';
import { parseSystemMessage, SystemMessageType } from '@/utils/systemMessages';

export interface GameChatChannelActivity {
  privateHasUserMessages: boolean;
  adminsHasUserMessages: boolean;
}

export const EMPTY_GAME_CHAT_CHANNEL_ACTIVITY: GameChatChannelActivity = {
  privateHasUserMessages: false,
  adminsHasUserMessages: false,
};

const CHANNEL_CREATION_TYPES: Record<'PRIVATE' | 'ADMINS', SystemMessageType> = {
  PRIVATE: SystemMessageType.PARTICIPANTS_ONLY_CHAT_CREATED,
  ADMINS: SystemMessageType.ADMINS_CHAT_CREATED,
};

export function chatMessagesHaveUserSender(messages: ChatMessage[]): boolean {
  return messages.some((m) => m.senderId != null);
}

function messageActivatesChannel(
  message: ChatMessage,
  chatType: 'PRIVATE' | 'ADMINS'
): boolean {
  if (message.senderId != null) return true;
  const parsed = parseSystemMessage(message.content ?? '');
  return parsed?.type === CHANNEL_CREATION_TYPES[chatType];
}

export function gameChatChannelIsActive(
  messages: ChatMessage[],
  chatType: 'PRIVATE' | 'ADMINS'
): boolean {
  return messages.some((m) => messageActivatesChannel(m, chatType));
}

export function chatMessageActivatesGameChannel(message: ChatMessage): 'PRIVATE' | 'ADMINS' | null {
  if (message.chatType === 'PRIVATE' && messageActivatesChannel(message, 'PRIVATE')) {
    return 'PRIVATE';
  }
  if (message.chatType === 'ADMINS' && messageActivatesChannel(message, 'ADMINS')) {
    return 'ADMINS';
  }
  return null;
}

export function filterGameChatTypesByChannelActivity(
  types: ChatType[],
  activity: GameChatChannelActivity
): ChatType[] {
  return types.filter((t) => {
    if (t === 'PRIVATE') return activity.privateHasUserMessages;
    if (t === 'ADMINS') return activity.adminsHasUserMessages;
    return true;
  });
}
