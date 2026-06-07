import type { ChatContextType, ChatMessage } from '@/api/chat';
import { chatSyncPullStarted, chatSyncPullEnded } from '@/services/chat/chatOfflineBanner';
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
import { patchLocalPollDirect, patchLocalTranscriptionDirect } from './chatLocalApplyPatchFields';

export async function onSocketSyncSeqDirect(
  contextType: ChatContextType,
  contextId: string,
  syncSeq: number
): Promise<void> {
  const last = await getLocalCursorSeq(contextType, contextId);
  if (syncSeq <= last) return;

  chatSyncPullStarted();
  try {
    const { repairedStaleCursor, threadInvalidated } = await pullEventsLoop(contextType, contextId);
    markChatPullCompleted(contextType, contextId);
    await reconcileCursorWithServerHead(contextType, contextId);
    if (repairedStaleCursor || threadInvalidated) {
      const { persistLatestTailPagesAfterStaleCursor } = await import('./chatTailRecover');
      await persistLatestTailPagesAfterStaleCursor(contextType, contextId).catch(() => {});
    }
    clearPendingSocketSeqReconcileTimer(contextType, contextId);
    const after = await getLocalCursorSeq(contextType, contextId);
    if (after < syncSeq) {
      await bumpCursor(contextType, contextId, syncSeq);
    }
  } catch {
    /* keep cursor unchanged so a later reconnect can retry gap fill */
  } finally {
    chatSyncPullEnded();
  }
}

export async function onSocketSyncSeq(
  contextType: ChatContextType,
  contextId: string,
  syncSeq: number | undefined
): Promise<number> {
  if (syncSeq == null) {
    scheduleReconcileWhenSocketSeqMissing(contextType, contextId);
    return 0;
  }
  const { applyThreadEvent } = await import('./chatLocalApplyThreadEvent');
  return applyThreadEvent({ kind: 'socketSyncSeq', contextType, contextId, syncSeq });
}

export async function persistSocketPatchThenSyncSeqDirect(
  contextType: ChatContextType,
  contextId: string,
  patchDirect: () => Promise<void>,
  syncSeq: number | undefined
): Promise<void> {
  await patchDirect();
  if (syncSeq != null) {
    await onSocketSyncSeqDirect(contextType, contextId, syncSeq);
  } else {
    scheduleReconcileWhenSocketSeqMissing(contextType, contextId);
  }
}

export function persistSocketPatchThenSyncSeq(
  contextType: ChatContextType,
  contextId: string,
  patchDirect: () => Promise<void>,
  syncSeq: number | undefined
): Promise<number> {
  return import('./chatLocalApplyThreadEvent').then(({ applyThreadEvent }) =>
    applyThreadEvent({ kind: 'socketPatch', contextType, contextId, patchDirect, syncSeq })
  );
}

export function persistSocketTranscriptionAndSyncSeq(
  contextType: ChatContextType,
  contextId: string,
  messageId: string,
  audioTranscription: NonNullable<ChatMessage['audioTranscription']>,
  syncSeq: number | undefined
): Promise<number> {
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
): Promise<number> {
  return persistSocketPatchThenSyncSeq(
    contextType,
    contextId,
    () => patchLocalPollDirect(messageId, poll),
    syncSeq
  );
}
