import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { ChatContextType, ChatMessageWithStatus } from '@/api/chat';
import type { ChatType } from '@/types';
import {
  loadLocalThreadBootstrap,
  pullAndApplyChatSyncEvents,
} from '@/services/chat/chatLocalApply';
import {
  hydrateLastMessageIdFromDexieIfMissing,
  syncLastMessageIdsToStoreFromLocalHeadsForContext,
} from '@/services/chat/messageContextHead';
import { pullMissedAndPersistToDexie } from '@/services/chat/chatThreadNetworkSync';
import { takeMissedMessagesForOpen } from '@/services/chat/chatOpenMissedFlush';
import { useChatSyncStore } from '@/store/chatSyncStore';
import { enqueueChatSyncPull, SYNC_PRIORITY_FOREGROUND } from '@/services/chat/chatSyncScheduler';
import { chatOpenMessagesSnapshotEqual, mergeOpenSnapshot } from './chatOpenSnapshot';
import { commitChatOpenMessages, traceChatOpenLength } from './chatOpenTrace';

/** Latest `reconcileChatThreadOpen` call; stale runs must not clear `isOpenSyncing` or commit. */
let openReconcileGeneration = 0;

function isActiveOpenReconcile(generation: number): boolean {
  return generation === openReconcileGeneration;
}

export type ChatOpenReconcileParams = {
  contextType: ChatContextType;
  contextId: string;
  gameChatType: ChatType;
  currentIdRef: RefObject<string | undefined>;
  messagesRef: RefObject<ChatMessageWithStatus[]>;
  setMessages: Dispatch<SetStateAction<ChatMessageWithStatus[]>>;
};

export { takeAllGameTabMissedMessages } from '@/services/chat/chatOpenMissedFlush';

/** Tail-only open reconcile — no full-thread `loadLocalMessagesForThread`. */
export async function reconcileChatThreadOpen(params: ChatOpenReconcileParams): Promise<void> {
  const { contextType, contextId, gameChatType, currentIdRef, messagesRef, setMessages } = params;

  if (currentIdRef.current !== contextId) return;

  const generation = ++openReconcileGeneration;
  useChatSyncStore.getState().setOpenSyncing(true);

  await hydrateLastMessageIdFromDexieIfMissing(
    contextType,
    contextId,
    contextType === 'GAME' ? gameChatType : undefined
  );

  try {
    if (currentIdRef.current !== contextId) return;

    const missedBuffer = takeMissedMessagesForOpen(
      contextType,
      contextId,
      contextType === 'GAME' ? gameChatType : undefined
    );
    const missedNetwork = await pullMissedAndPersistToDexie({
      contextType,
      contextId,
      gameChatType: contextType === 'GAME' ? gameChatType : undefined,
    });
    if (currentIdRef.current !== contextId) return;

    await pullAndApplyChatSyncEvents(contextType, contextId);
    if (currentIdRef.current !== contextId) return;

    await syncLastMessageIdsToStoreFromLocalHeadsForContext(contextType, contextId);

    const { messages: dexieTail } = await loadLocalThreadBootstrap(contextType, contextId, gameChatType);
    if (currentIdRef.current !== contextId) return;

    let next = messagesRef.current;
    if (missedBuffer.length > 0) {
      next = mergeOpenSnapshot(next, missedBuffer, []);
    }
    if (missedNetwork.length > 0) {
      next = mergeOpenSnapshot(next, missedNetwork, []);
    }
    if (dexieTail.length > 0) {
      next = mergeOpenSnapshot(next, dexieTail, []);
    }

    if (
      currentIdRef.current === contextId &&
      isActiveOpenReconcile(generation) &&
      !chatOpenMessagesSnapshotEqual(messagesRef.current, next)
    ) {
      commitChatOpenMessages(messagesRef, (v) => setMessages(v), next, 'reconcile-batched');
      traceChatOpenLength('afterReconcile', next.length);
      await syncLastMessageIdsToStoreFromLocalHeadsForContext(contextType, contextId);
    }
  } catch {
    void enqueueChatSyncPull(contextType, contextId, SYNC_PRIORITY_FOREGROUND);
  } finally {
    if (isActiveOpenReconcile(generation)) {
      useChatSyncStore.getState().setOpenSyncing(false);
    }
  }
}
