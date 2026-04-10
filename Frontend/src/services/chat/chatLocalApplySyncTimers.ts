import type { ChatContextType } from '@/api/chat';
import { chatCursorKey } from './chatLocalDb';
import { reconcileCursorWithServerHead } from './chatLocalApplyCursor';
import { enqueueChatSyncPull, SYNC_PRIORITY_GAP } from './chatSyncScheduler';

const socketSeqMissingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lastPullCompletedAtByKey = new Map<string, number>();
const PULL_COALESCE_MS = 450;
const SOCKET_SEQ_MISSING_BASE_MS = 1400;

export function markChatPullCompleted(contextType: ChatContextType, contextId: string): void {
  lastPullCompletedAtByKey.set(chatCursorKey(contextType, contextId), Date.now());
}

export function clearPendingSocketSeqReconcileTimer(contextType: ChatContextType, contextId: string): void {
  const key = chatCursorKey(contextType, contextId);
  const t = socketSeqMissingTimers.get(key);
  if (t != null) {
    clearTimeout(t);
    socketSeqMissingTimers.delete(key);
  }
}

export function scheduleReconcileWhenSocketSeqMissing(contextType: ChatContextType, contextId: string): void {
  const key = chatCursorKey(contextType, contextId);
  const prev = socketSeqMissingTimers.get(key);
  if (prev) clearTimeout(prev);
  const lastDone = lastPullCompletedAtByKey.get(key) ?? 0;
  const extra = Math.max(0, PULL_COALESCE_MS - (Date.now() - lastDone));
  socketSeqMissingTimers.set(
    key,
    setTimeout(() => {
      socketSeqMissingTimers.delete(key);
      void reconcileCursorWithServerHead(contextType, contextId).catch(() => {});
      void enqueueChatSyncPull(contextType, contextId, SYNC_PRIORITY_GAP);
    }, SOCKET_SEQ_MISSING_BASE_MS + extra)
  );
}
