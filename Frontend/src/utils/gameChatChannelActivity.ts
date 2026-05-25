import type { ChatMessage } from '@/api/chat';
import type { ChatType } from '@/types';

export interface GameChatChannelActivity {
  privateHasUserMessages: boolean;
  adminsHasUserMessages: boolean;
}

export const EMPTY_GAME_CHAT_CHANNEL_ACTIVITY: GameChatChannelActivity = {
  privateHasUserMessages: false,
  adminsHasUserMessages: false,
};

export function chatMessagesHaveUserSender(messages: ChatMessage[]): boolean {
  return messages.some((m) => m.senderId != null);
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
