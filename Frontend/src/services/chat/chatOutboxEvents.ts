import type { ChatContextType, ChatMessage } from '@/api/chat';

export const CHAT_OUTBOX_SUCCESS_EVENT = 'bandeja-chat-outbox-success';
export const CHAT_OUTBOX_FAILED_EVENT = 'bandeja-chat-outbox-failed';
export const CHAT_OUTBOX_REMOVED_EVENT = 'bandeja-chat-outbox-removed';

export type ChatOutboxSuccessDetail = {
  tempId: string;
  contextType: ChatContextType;
  contextId: string;
  message: ChatMessage;
};

export function dispatchChatOutboxSuccess(detail: ChatOutboxSuccessDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHAT_OUTBOX_SUCCESS_EVENT, { detail }));
}
