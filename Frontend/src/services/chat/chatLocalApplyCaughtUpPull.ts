import type { ChatContextType } from '@/api/chat';
import { chatCursorKey, chatLocalDb } from './chatLocalDb';
import { BATCH_HEAD_CACHE_MS, getLocalCursorSeq } from './chatLocalApplyCursor';
import { shouldBypassCaughtUpSyncPullForMessageDeleted } from './chatLocalMessageTombstone';

export type CaughtUpSyncPullOptions = {
  expectedServerMaxSeq?: number;
  forcePull?: boolean;
};

export async function shouldSkipCaughtUpSyncPull(
  contextType: ChatContextType,
  contextId: string,
  options?: CaughtUpSyncPullOptions
): Promise<boolean> {
  if (options?.forcePull) return false;
  if (shouldBypassCaughtUpSyncPullForMessageDeleted(contextType, contextId)) {
    return false;
  }
  const local = await getLocalCursorSeq(contextType, contextId);
  if (options?.expectedServerMaxSeq != null) {
    return local >= options.expectedServerMaxSeq;
  }
  const key = chatCursorKey(contextType, contextId);
  const threadRow = await chatLocalDb.chatThreads.get(key);
  const cachedMax = threadRow?.serverMaxSeq;
  if (cachedMax == null) return false;
  const age = threadRow?.updatedAt != null ? Date.now() - threadRow.updatedAt : Infinity;
  return age < BATCH_HEAD_CACHE_MS && local >= cachedMax;
}
