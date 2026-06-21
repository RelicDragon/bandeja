import type { ChatContextType } from '@/api/chat';
import type { ChatType } from '@/types';

export function chatConversationKey(
  chatContextType: ChatContextType,
  contextId: string,
  chatType?: ChatType | string | null
): string {
  switch (chatContextType) {
    case 'USER':
      return `user-chat:${contextId}`;
    case 'GAME':
      return `game-chat:${contextId}:${chatType ?? 'PUBLIC'}`;
    case 'GROUP':
      return `group:${contextId}`;
    case 'BUG':
      return `bug:${contextId}`;
    default:
      return `${chatContextType}:${contextId}`;
  }
}
