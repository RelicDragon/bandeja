import type { ChatContextType, ChatMessage } from '@/api/chat';
import { donateOutgoingChatIntent } from '@/services/chat/chatIntentDonation';

export const CHAT_OUTBOX_SUCCESS_EVENT = 'bandeja-chat-outbox-success';
export const CHAT_OUTBOX_FAILED_EVENT = 'bandeja-chat-outbox-failed';
export const CHAT_OUTBOX_REMOVED_EVENT = 'bandeja-chat-outbox-removed';

export type ChatOutboxRemovalReason = 'threadArchived';
export type ChatOutboxArchiveReason = 'game_cancelled';

export type ChatOutboxSuccessDetail = {
  tempId: string;
  contextType: ChatContextType;
  contextId: string;
  message: ChatMessage;
};

export type ChatOutboxRemovedDetail = {
  contextType: ChatContextType;
  contextId: string;
  tempIds: string[];
  reason?: ChatOutboxRemovalReason;
  archiveReason?: ChatOutboxArchiveReason;
};

export function dispatchChatOutboxSuccess(detail: ChatOutboxSuccessDetail): void {
  donateOutgoingChatIntent(detail.message);
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHAT_OUTBOX_SUCCESS_EVENT, { detail }));
}

export function dispatchChatOutboxRemoved(detail: ChatOutboxRemovedDetail): void {
  if (typeof window === 'undefined') return;
  queueMicrotask(() => {
    window.dispatchEvent(new CustomEvent(CHAT_OUTBOX_REMOVED_EVENT, { detail }));
  });
}
