import type { ChatContextType } from '@/api/chat';

export const BANDEJA_CHAT_READ_BATCH_APPLIED = 'bandeja:chat-read-batch-applied';

export type ChatReadBatchAppliedDetail = {
  contextType: ChatContextType;
  contextId: string;
  userId: string;
  readAt: string;
  messageIds: string[];
};

export function dispatchChatReadBatchApplied(detail: ChatReadBatchAppliedDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(BANDEJA_CHAT_READ_BATCH_APPLIED, { detail }));
}
