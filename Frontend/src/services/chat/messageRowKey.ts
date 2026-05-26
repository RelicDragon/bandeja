import type { ChatMessage, ChatMessageWithStatus } from '@/api/chat';

/** Stable virtualizer / stagger identity across optimistic id → server id replacement. */
export function getMessageRowKey(message: ChatMessage): string {
  const m = message as ChatMessageWithStatus;
  const cid = m._clientMutationId ?? message.clientMutationId;
  if (cid) return `cid:${cid}`;
  return message.id;
}
