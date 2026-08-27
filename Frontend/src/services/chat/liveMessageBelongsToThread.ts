import type { ChatContextType, ChatMessage } from '@/api/chat';

export type ThreadBelongingConfig = {
  contextType: ChatContextType;
  contextId: string;
};

/**
 * True only when the message is explicitly scoped to this open thread.
 * Missing/empty contextId must not belong (cross-thread leak / orphan hole).
 */
export function liveMessageBelongsToThread(
  message: Pick<ChatMessage, 'chatContextType' | 'contextId'>,
  config: ThreadBelongingConfig
): boolean {
  if (!config.contextId) return false;
  const messageContextId = message.contextId;
  if (messageContextId == null || messageContextId === '') return false;
  if (messageContextId !== config.contextId) return false;
  if (message.chatContextType && message.chatContextType !== config.contextType) return false;
  return true;
}

export function filterMessagesBelongingToThread<T extends Pick<ChatMessage, 'chatContextType' | 'contextId'>>(
  messages: readonly T[],
  config: ThreadBelongingConfig
): T[] {
  return messages.filter((m) => liveMessageBelongsToThread(m, config));
}

/** Fill missing thread scope from the socket/room envelope (inbox + room paths). */
export function stampMessageThreadContext<T extends Pick<ChatMessage, 'chatContextType' | 'contextId'>>(
  message: T,
  contextType: ChatContextType,
  contextId: string
): T {
  return {
    ...message,
    chatContextType: message.chatContextType ?? contextType,
    contextId: message.contextId ?? contextId,
  };
}
