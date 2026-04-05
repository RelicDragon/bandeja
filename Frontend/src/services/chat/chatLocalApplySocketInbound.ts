import type { ChatContextType, ChatMessage } from '@/api/chat';
import { chatSyncPullStarted, chatSyncPullEnded } from '@/services/chat/chatOfflineBanner';
import { enqueueChatLocalContextApply } from './chatLocalApplyQueue';
import { syncLastMessageIdsToStoreFromLocalHeadsForContext } from './messageContextHead';
import {
  bumpCursor,
  getLocalCursorSeq,
  reconcileCursorWithServerHead,
} from './chatLocalApplyCursor';
import {
  clearPendingSocketSeqReconcileTimer,
  markChatPullCompleted,
  scheduleReconcileWhenSocketSeqMissing,
} from './chatLocalApplySyncTimers';
import { pullEventsLoop } from './chatLocalApplyPull';
import { putLocalMessageDirect } from './chatLocalApplyWrite';
import { patchLocalPollDirect, patchLocalTranscriptionDirect } from './chatLocalApplyPatchFields';

async function onSocketSyncSeqUnqueued(
  contextType: ChatContextType,
  contextId: string,
  syncSeq: number
): Promise<void> {
  const last = await getLocalCursorSeq(contextType, contextId);
  if (syncSeq <= last) return;

  if (syncSeq > last + 1) {
    chatSyncPullStarted();
    try {
      const { repairedStaleCursor, threadInvalidated } = await pullEventsLoop(contextType, contextId);
      markChatPullCompleted(contextType, contextId);
      await reconcileCursorWithServerHead(contextType, contextId);
      if (repairedStaleCursor || threadInvalidated) {
        const { persistLatestTailPagesAfterStaleCursor } = await import('./chatTailRecover');
        await persistLatestTailPagesAfterStaleCursor(contextType, contextId).catch(() => {});
        await syncLastMessageIdsToStoreFromLocalHeadsForContext(contextType, contextId);
      }
      clearPendingSocketSeqReconcileTimer(contextType, contextId);
    } catch {
      /* keep cursor unchanged so a later reconnect can retry gap fill */
    } finally {
      chatSyncPullEnded();
    }
    return;
  }

  await bumpCursor(contextType, contextId, syncSeq);
}

export async function onSocketSyncSeq(
  contextType: ChatContextType,
  contextId: string,
  syncSeq: number | undefined
): Promise<void> {
  if (syncSeq == null) {
    scheduleReconcileWhenSocketSeqMissing(contextType, contextId);
    return;
  }
  return enqueueChatLocalContextApply(contextType, contextId, () =>
    onSocketSyncSeqUnqueued(contextType, contextId, syncSeq)
  );
}

export function persistSocketInboundMessage(
  contextType: ChatContextType,
  contextId: string,
  message: ChatMessage,
  syncSeq: number | undefined
): Promise<void> {
  return enqueueChatLocalContextApply(contextType, contextId, async () => {
    await putLocalMessageDirect(syncSeq != null ? { ...message, syncSeq } : message);
    if (syncSeq != null) {
      await onSocketSyncSeqUnqueued(contextType, contextId, syncSeq);
    } else {
      scheduleReconcileWhenSocketSeqMissing(contextType, contextId);
    }
  });
}

export function persistSocketPatchThenSyncSeq(
  contextType: ChatContextType,
  contextId: string,
  patchDirect: () => Promise<void>,
  syncSeq: number | undefined
): Promise<void> {
  return enqueueChatLocalContextApply(contextType, contextId, async () => {
    await patchDirect();
    if (syncSeq != null) {
      await onSocketSyncSeqUnqueued(contextType, contextId, syncSeq);
    } else {
      scheduleReconcileWhenSocketSeqMissing(contextType, contextId);
    }
  });
}

export function persistSocketTranscriptionAndSyncSeq(
  contextType: ChatContextType,
  contextId: string,
  messageId: string,
  audioTranscription: NonNullable<ChatMessage['audioTranscription']>,
  syncSeq: number | undefined
): Promise<void> {
  return persistSocketPatchThenSyncSeq(
    contextType,
    contextId,
    () => patchLocalTranscriptionDirect(messageId, audioTranscription),
    syncSeq
  );
}

export function persistSocketPollVoteAndSyncSeq(
  contextType: ChatContextType,
  contextId: string,
  messageId: string,
  poll: NonNullable<ChatMessage['poll']>,
  syncSeq: number | undefined
): Promise<void> {
  return persistSocketPatchThenSyncSeq(contextType, contextId, () => patchLocalPollDirect(messageId, poll), syncSeq);
}
