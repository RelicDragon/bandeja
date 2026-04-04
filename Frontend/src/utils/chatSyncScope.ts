import type { ChatContextType } from '@/api/chat';
import type { ChatType } from '@/types';
import { normalizeChatType } from '@/utils/chatType';

export function chatSyncTailKey(
  contextType: ChatContextType,
  contextId: string,
  gameChatType?: ChatType
): string {
  if (contextType === 'GAME') {
    return `${contextType}:${contextId}:${normalizeChatType(gameChatType ?? 'PUBLIC')}`;
  }
  return `${contextType}:${contextId}`;
}

export function messageHeadDexieKey(
  contextType: ChatContextType,
  contextId: string,
  chatType: ChatType
): string {
  if (contextType === 'GAME') {
    return `${contextType}:${contextId}:${normalizeChatType(chatType)}`;
  }
  return `${contextType}:${contextId}`;
}
