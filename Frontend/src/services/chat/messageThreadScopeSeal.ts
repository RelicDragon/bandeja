import type { ChatMessage } from '@/api/chat';

/**
 * Message ids are global in Dexie. Once a row is sealed to a thread, never reassign
 * chatContextType/contextId (cross-thread rewrite / H2 leak).
 */
export function sealMessageThreadScope<T extends ChatMessage>(
  existing: T | undefined,
  incoming: T
): T {
  if (!existing) return incoming;
  const sealedType = existing.chatContextType;
  const sealedId = existing.contextId;
  const hasSeal =
    sealedType != null &&
    sealedId != null &&
    sealedId !== '';
  if (!hasSeal) return incoming;
  return {
    ...incoming,
    chatContextType: sealedType,
    contextId: sealedId,
  };
}

/** True when the payload already names a concrete thread (safe for live paint). */
export function messageHasExplicitThreadScope(
  message: Pick<ChatMessage, 'contextId'>,
  contextId: string
): boolean {
  if (!contextId) return false;
  const id = message.contextId;
  return id != null && id !== '' && id === contextId;
}
