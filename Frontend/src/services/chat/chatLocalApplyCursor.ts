import type { ChatContextType } from '@/api/chat';
import { chatApi } from '@/api/chat';
import { chatCursorKey, chatLocalDb } from './chatLocalDb';
import { broadcastChatPullHint } from './chatLocalCoop';

const BATCH_HEAD_CACHE_MS = 30_000;

export { BATCH_HEAD_CACHE_MS };

export type ReconcileCursorOptions = {
  expectedServerMaxSeq?: number;
};

export async function reconcileCursorWithServerHead(
  contextType: ChatContextType,
  contextId: string,
  options?: ReconcileCursorOptions
): Promise<void> {
  try {
    const key = chatCursorKey(contextType, contextId);
    const local = (await chatLocalDb.chatSyncCursor.get(key))?.lastAppliedSeq ?? 0;
    let head = options?.expectedServerMaxSeq;
    if (head != null && local >= head) return;
    if (head == null) {
      const threadRow = await chatLocalDb.chatThreads.get(key);
      const cachedMax = threadRow?.serverMaxSeq;
      const warmHeadAge = threadRow?.updatedAt != null ? Date.now() - threadRow.updatedAt : Infinity;
      const cacheFresh = cachedMax != null && warmHeadAge < BATCH_HEAD_CACHE_MS;
      if (cacheFresh && local < cachedMax) {
        head = cachedMax;
      } else if (cacheFresh && local >= cachedMax) {
        // Recent batch-head already says we are caught up; skip per-thread /head.
        return;
      } else {
        head = await chatApi.getChatSyncHead(contextType, contextId);
      }
    }
    if (head > local) {
      if (import.meta.env.DEV) {
        console.warn('[chatSync] server head ahead of applied cursor; scheduling pull', {
          contextType,
          contextId,
          head,
          local,
        });
      }
      broadcastChatPullHint(key);
      void import('./chatSyncScheduler').then((m) =>
        m.enqueueChatSyncPull(contextType, contextId, m.SYNC_PRIORITY_GAP)
      );
    }
  } catch {
    /* offline */
  }
}

export async function bumpCursor(contextType: ChatContextType, contextId: string, seq: number): Promise<void> {
  const key = chatCursorKey(contextType, contextId);
  const row = await chatLocalDb.chatSyncCursor.get(key);
  const next = Math.max(row?.lastAppliedSeq ?? 0, seq);
  await chatLocalDb.chatSyncCursor.put({
    key,
    lastAppliedSeq: next,
    updatedAt: Date.now(),
  });
  broadcastChatPullHint(key);
}

export async function getLocalCursorSeq(
  contextType: ChatContextType,
  contextId: string
): Promise<number> {
  const row = await chatLocalDb.chatSyncCursor.get(chatCursorKey(contextType, contextId));
  return row?.lastAppliedSeq ?? 0;
}

export const getLastAppliedSyncSeq = getLocalCursorSeq;
