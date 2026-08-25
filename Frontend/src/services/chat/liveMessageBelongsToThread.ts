import type { ChatContextType, ChatMessage } from '@/api/chat';

export function liveMessageBelongsToThread(
  message: Pick<ChatMessage, 'chatContextType' | 'contextId'>,
  config: { contextType: ChatContextType; contextId: string }
): boolean {
  if (message.chatContextType && message.chatContextType !== config.contextType) return false;
  if (message.contextId && message.contextId !== config.contextId) return false;
  return true;
}
