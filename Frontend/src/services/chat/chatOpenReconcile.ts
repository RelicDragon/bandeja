import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { ChatContextType, ChatMessage, ChatMessageWithStatus } from '@/api/chat';
import type { ChatType } from '@/types';
import {
  loadLocalMessagesForThread,
  pullAndApplyChatSyncEvents,
} from '@/services/chat/chatLocalApply';
import { hydrateLastMessageIdFromDexieIfMissing } from '@/services/chat/messageContextHead';
import { pullMissedAndPersistToDexie } from '@/services/chat/chatThreadNetworkSync';
import { useChatSyncStore } from '@/store/chatSyncStore';
import { mergeChatMessagesAscending, mergeServerPageWithPendingOptimistics } from '@/utils/chatMessageSort';
import { enqueueChatSyncPull, SYNC_PRIORITY_FOREGROUND } from '@/services/chat/chatSyncScheduler';

function tailMessageId(messages: ChatMessage[]): string | null {
  if (messages.length === 0) return null;
  return messages[messages.length - 1]!.id;
}

export type ChatOpenReconcileParams = {
  contextType: ChatContextType;
  contextId: string;
  gameChatType: ChatType;
  currentIdRef: RefObject<string | undefined>;
  messagesRef: RefObject<ChatMessageWithStatus[]>;
  setMessages: Dispatch<SetStateAction<ChatMessageWithStatus[]>>;
  mergeLocalRefresh?: (prev: ChatMessageWithStatus[], fresh: ChatMessage[]) => ChatMessageWithStatus[];
};

export async function reconcileChatThreadOpen(params: ChatOpenReconcileParams): Promise<void> {
  const {
    contextType,
    contextId,
    gameChatType,
    currentIdRef,
    messagesRef,
    setMessages,
    mergeLocalRefresh = mergeServerPageWithPendingOptimistics,
  } = params;

  if (currentIdRef.current !== contextId) return;

  await hydrateLastMessageIdFromDexieIfMissing(
    contextType,
    contextId,
    contextType === 'GAME' ? gameChatType : undefined
  );

  try {
    if (currentIdRef.current !== contextId) return;
    const missed = await pullMissedAndPersistToDexie({
      contextType,
      contextId,
      gameChatType: contextType === 'GAME' ? gameChatType : undefined,
    });
    if (currentIdRef.current !== contextId) return;
    if (missed.length > 0) {
      if (currentIdRef.current !== contextId) return;
      setMessages((prev) => {
        const merged = mergeChatMessagesAscending(prev, missed);
        messagesRef.current = merged;
        const tail = tailMessageId(merged);
        if (tail) {
          useChatSyncStore
            .getState()
            .setLastMessageId(contextType, contextId, tail, contextType === 'GAME' ? gameChatType : undefined);
        }
        return merged;
      });
    }

    await pullAndApplyChatSyncEvents(contextType, contextId);
    if (currentIdRef.current !== contextId) return;

    const fresh = await loadLocalMessagesForThread(contextType, contextId, gameChatType);
    setMessages((prev) => {
      const merged = mergeLocalRefresh(prev, fresh);
      messagesRef.current = merged;
      return merged;
    });
    const tid = tailMessageId(fresh);
    if (tid) {
      useChatSyncStore
        .getState()
        .setLastMessageId(contextType, contextId, tid, contextType === 'GAME' ? gameChatType : undefined);
    }
  } catch {
    void enqueueChatSyncPull(contextType, contextId, SYNC_PRIORITY_FOREGROUND);
  }
}
