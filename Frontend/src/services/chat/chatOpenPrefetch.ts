import type { ChatContextType, ChatMessageWithStatus } from '@/api/chat';
import type { ChatType } from '@/types';
import { loadLocalThreadBootstrap, pullAndApplyChatSyncEvents } from '@/services/chat/chatLocalApply';
import {
  hydrateLastMessageIdFromDexieIfMissing,
  syncLastMessageIdsToStoreFromLocalHeadsForContext,
} from '@/services/chat/messageContextHead';
import { pullMissedAndPersistToDexie } from '@/services/chat/chatThreadNetworkSync';
import { mergeMissedIntoWarmRef, takeMissedMessagesForOpen } from '@/services/chat/chatOpenMissedFlush';
import { mergeOpenSnapshot } from '@/services/chat/chatOpenSnapshot';

/**
 * Network + Dexie prefetch before first open paint (push / cold resume).
 * Ensures messagesRef and Zustand tail align with server before L1/bootstrap snapshot.
 */
export async function prefetchOpenThreadLocal(
  contextType: ChatContextType,
  contextId: string,
  gameChatType: ChatType
): Promise<ChatMessageWithStatus[]> {
  await hydrateLastMessageIdFromDexieIfMissing(
    contextType,
    contextId,
    contextType === 'GAME' ? gameChatType : undefined
  );

  const missedNetwork = await pullMissedAndPersistToDexie({
    contextType,
    contextId,
    gameChatType: contextType === 'GAME' ? gameChatType : undefined,
  });

  await pullAndApplyChatSyncEvents(contextType, contextId);
  await syncLastMessageIdsToStoreFromLocalHeadsForContext(contextType, contextId);

  const missedBuffer = takeMissedMessagesForOpen(
    contextType,
    contextId,
    contextType === 'GAME' ? gameChatType : undefined
  );
  const missed = mergeMissedIntoWarmRef(missedNetwork, missedBuffer);

  const { messages: dexieTail } = await loadLocalThreadBootstrap(contextType, contextId, gameChatType);
  return mergeOpenSnapshot([], dexieTail, missed as ChatMessageWithStatus[]);
}
