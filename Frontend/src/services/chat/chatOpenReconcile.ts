import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { ChatContextType, ChatMessage, ChatMessageWithStatus } from '@/api/chat';
import type { ChatType } from '@/types';
import {
  loadLocalThreadBootstrap,
  pullAndApplyChatSyncEvents,
} from '@/services/chat/chatLocalApply';
import { hydrateLastMessageIdFromDexieIfMissing } from '@/services/chat/messageContextHead';
import { pullMissedAndPersistToDexie } from '@/services/chat/chatThreadNetworkSync';
import { useChatSyncStore } from '@/store/chatSyncStore';
import { mergeChatMessagesAscending } from '@/utils/chatMessageSort';
import { enqueueChatSyncPull, SYNC_PRIORITY_FOREGROUND } from '@/services/chat/chatSyncScheduler';
import { mergeOpenSnapshot } from './chatOpenSnapshot';
import { commitChatOpenMessages, traceChatOpenLength } from './chatOpenTrace';

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
};

/** Merge missed buffers for all game tab heads (pre-paint flush). */
export function takeAllGameTabMissedMessages(contextId: string): ChatMessage[] {
  const tabs: ChatType[] = ['PUBLIC', 'PRIVATE', 'ADMINS', 'PHOTOS'];
  const store = useChatSyncStore.getState();
  const collected: ChatMessage[] = [];
  for (const tab of tabs) {
    collected.push(...store.getAndClearMissed('GAME', contextId, tab));
  }
  if (collected.length === 0) return [];
  return mergeChatMessagesAscending([], collected);
}

/** Tail-only open reconcile — no full-thread `loadLocalMessagesForThread`. */
export async function reconcileChatThreadOpen(params: ChatOpenReconcileParams): Promise<void> {
  const { contextType, contextId, gameChatType, currentIdRef, messagesRef, setMessages } = params;

  if (currentIdRef.current !== contextId) return;

  useChatSyncStore.getState().setOpenSyncing(true);

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

    await pullAndApplyChatSyncEvents(contextType, contextId);
    if (currentIdRef.current !== contextId) return;

    const { messages: dexieTail } = await loadLocalThreadBootstrap(contextType, contextId, gameChatType);
    if (currentIdRef.current !== contextId) return;

    let next = messagesRef.current;
    if (missed.length > 0) {
      next = mergeOpenSnapshot(next, missed, []);
    }
    if (dexieTail.length > 0) {
      next = mergeOpenSnapshot(next, dexieTail, []);
    }

    if (missed.length > 0 || dexieTail.length > 0) {
      commitChatOpenMessages(messagesRef, (v) => setMessages(v), next, 'reconcile-batched');
      traceChatOpenLength('afterReconcile', next.length);
      const tail = tailMessageId(next);
      if (tail) {
        useChatSyncStore
          .getState()
          .setLastMessageId(contextType, contextId, tail, contextType === 'GAME' ? gameChatType : undefined);
      }
    }
  } catch {
    void enqueueChatSyncPull(contextType, contextId, SYNC_PRIORITY_FOREGROUND);
  } finally {
    if (currentIdRef.current === contextId) {
      useChatSyncStore.getState().setOpenSyncing(false);
    }
  }
}
