import type { ChatMessage } from '@/api/chat';
import type { ChatLocalRow } from './chatLocalDb';

export function rowFromMessage(m: ChatMessage): ChatLocalRow {
  const deletedAt = m.deletedAt ? new Date(m.deletedAt).getTime() : undefined;
  return {
    id: m.id,
    contextType: m.chatContextType,
    contextId: m.contextId,
    chatType: m.chatType,
    createdAt: new Date(m.createdAt).getTime(),
    deletedAt,
    payload: m,
  };
}
