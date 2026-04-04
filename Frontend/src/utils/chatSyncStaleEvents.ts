import type { ChatContextType } from '@/api/chat';

export const BANDEJA_CHAT_SYNC_STALE = 'bandeja:chat-sync-stale';

export type ChatSyncStaleDetail = {
  contextType: ChatContextType;
  contextId: string;
};

export function dispatchChatSyncStale(contextType: ChatContextType, contextId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(BANDEJA_CHAT_SYNC_STALE, {
      detail: { contextType, contextId } as ChatSyncStaleDetail,
    })
  );
}
