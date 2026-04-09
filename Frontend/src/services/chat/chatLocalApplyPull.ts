import type { ChatContextType, ChatMessage } from '@/api/chat';
import { chatApi } from '@/api/chat';
import { chatCursorKey, chatLocalDb } from './chatLocalDb';
import { dispatchChatSyncStale } from '@/utils/chatSyncStaleEvents';
import { recordChatSyncStaleDispatch } from '@/services/chat/chatSyncMetrics';
import { broadcastChatPullHint } from './chatLocalCoop';
import { patchThreadIndexAfterMessageDeleted, patchThreadIndexFromMessage } from './chatThreadIndex';
import {
  bumpMessageContextHead,
  refreshMessageContextHeadAfterDelete,
  syncLastMessageIdsToStoreFromLocalHeadsForContext,
} from './messageContextHead';
import { enqueueChatLocalContextApply } from './chatLocalApplyQueue';
import { purgeLocalDexieThread } from './chatLocalThreadPurge';
import { scheduleChatMediaThumbPrefetchForMessage } from '@/services/chat/chatMediaThumbPrefetch';
import { withChatSyncRetry } from '@/services/chat/chatHttpRetry';
import { fetchChatSyncEventsPackOffMainThread } from '@/services/chat/chatSyncFetchWorkerClient';
import { chatSyncEventsToPatches } from '@/services/chat/chatSyncEventsToPatches';
import { applyChatSyncPatchesInSlice } from '@/services/chat/chatSyncApplyPatches';
import { rowFromMessage } from '@/services/chat/chatSyncRowUtils';
import type { ChatSyncEventDTO } from '@/services/chat/chatSyncEventTypes';
import { withChatLocalBulkApply } from './chatLocalApplyBulk';
import { persistChatMessagesFromApi } from './chatLocalApplyWrite';
import { getLocalCursorSeq, reconcileCursorWithServerHead } from './chatLocalApplyCursor';
import {
  clearPendingSocketSeqReconcileTimer,
  markChatPullCompleted,
} from './chatLocalApplySyncTimers';

function schedulePullPageIndexHooks(events: ChatSyncEventDTO[]): void {
  void (async () => {
    for (const ev of events) {
      if (ev.eventType === 'MESSAGE_CREATED' || ev.eventType === 'MESSAGE_UPDATED') {
        const pl = ev.payload as { message?: ChatMessage; messageId?: string };
        const m = pl.message;
        if (m?.id) {
          const r = rowFromMessage(m);
          await bumpMessageContextHead(r).catch(() => {});
          await patchThreadIndexFromMessage(m).catch(() => {});
        } else if (pl.messageId && ev.eventType === 'MESSAGE_UPDATED') {
          const stored = await chatLocalDb.messages.get(pl.messageId);
          if (stored) {
            await bumpMessageContextHead(stored).catch(() => {});
            await patchThreadIndexFromMessage(stored.payload).catch(() => {});
          }
        }
      } else if (ev.eventType === 'MESSAGE_DELETED') {
        const mid = (ev.payload as { messageId?: string }).messageId;
        if (mid) {
          const row = await chatLocalDb.messages.get(mid);
          if (row) {
            void refreshMessageContextHeadAfterDelete(row.contextType, row.contextId, mid, row.chatType).catch(
              () => {}
            );
          }
          void patchThreadIndexAfterMessageDeleted(mid).catch(() => {});
        }
      }
    }
  })().catch(() => {});
}

type PullEventsLoopResult = { repairedStaleCursor: boolean; threadInvalidated: boolean };

export async function pullEventsLoop(
  contextType: ChatContextType,
  contextId: string
): Promise<PullEventsLoopResult> {
  let after = await getLocalCursorSeq(contextType, contextId);
  const key = chatCursorKey(contextType, contextId);
  let staleDispatched = false;
  let repairedStaleCursor = false;
  let threadInvalidated = false;
  for (;;) {
    const pack = await withChatSyncRetry('events', () =>
      fetchChatSyncEventsPackOffMainThread(contextType, contextId, after, 300)
    );
    if (pack.cursorStale && pack.oldestRetainedSeq != null) {
      repairedStaleCursor = true;
      const reset = Math.max(0, pack.oldestRetainedSeq - 1);
      await chatLocalDb.chatSyncCursor.put({
        key,
        lastAppliedSeq: reset,
        updatedAt: Date.now(),
      });
      if (!staleDispatched) {
        staleDispatched = true;
        recordChatSyncStaleDispatch();
        dispatchChatSyncStale(contextType, contextId);
      }
      after = reset;
      clearPendingSocketSeqReconcileTimer(contextType, contextId);
      continue;
    }
    if (!pack.events.length) break;
    await withChatLocalBulkApply(async () => {
      let i = 0;
      while (i < pack.events.length) {
        const ev = pack.events[i]!;
        if (ev.eventType === 'THREAD_LOCAL_INVALIDATE') {
          await purgeLocalDexieThread(contextType, contextId);
          recordChatSyncStaleDispatch();
          dispatchChatSyncStale(contextType, contextId);
          threadInvalidated = true;
          const rowInv = await chatLocalDb.chatSyncCursor.get(key);
          await chatLocalDb.chatSyncCursor.put({
            key,
            lastAppliedSeq: Math.max(rowInv?.lastAppliedSeq ?? 0, ev.seq),
            updatedAt: Date.now(),
          });
          i += 1;
          continue;
        }
        let j = i;
        while (j < pack.events.length && pack.events[j]!.eventType !== 'THREAD_LOCAL_INVALIDATE') {
          j += 1;
        }
        const slice = pack.events.slice(i, j);
        const patches = chatSyncEventsToPatches(slice);
        const { putMessagesForMedia, patchMessageFallbacks } = await chatLocalDb.transaction(
          'rw',
          [chatLocalDb.messages, chatLocalDb.chatSyncCursor, chatLocalDb.messageSearchTokens],
          async () => {
            const side = await applyChatSyncPatchesInSlice(patches, contextType, contextId);
            const lastSeq = slice[slice.length - 1]!.seq;
            const row = await chatLocalDb.chatSyncCursor.get(key);
            const next = Math.max(row?.lastAppliedSeq ?? 0, lastSeq);
            await chatLocalDb.chatSyncCursor.put({
              key,
              lastAppliedSeq: next,
              updatedAt: Date.now(),
            });
            return side;
          }
        );
        for (const fb of patchMessageFallbacks) {
          try {
            const m = await chatApi.getChatMessageById(fb.messageId);
            if (m.chatContextType !== contextType || m.contextId !== contextId) continue;
            await persistChatMessagesFromApi([
              { ...m, syncSeq: fb.syncSeq, serverSyncSeq: fb.syncSeq },
            ]);
          } catch {
            /* offline or 404 */
          }
        }
        for (const m of putMessagesForMedia) {
          if (m.thumbnailUrls?.some((u) => u && !u.startsWith('blob:') && !u.startsWith('data:'))) {
            scheduleChatMediaThumbPrefetchForMessage(m);
          }
        }
        i = j;
      }
    });
    after = pack.events[pack.events.length - 1]!.seq;
    schedulePullPageIndexHooks(pack.events);
    broadcastChatPullHint(key);
    if (!pack.hasMore) break;
  }
  return { repairedStaleCursor, threadInvalidated };
}

export async function pullAndApplyChatSyncEvents(
  contextType: ChatContextType,
  contextId: string
): Promise<void> {
  return enqueueChatLocalContextApply(contextType, contextId, async () => {
    const { repairedStaleCursor, threadInvalidated } = await pullEventsLoop(contextType, contextId);
    markChatPullCompleted(contextType, contextId);
    await reconcileCursorWithServerHead(contextType, contextId);
    await syncLastMessageIdsToStoreFromLocalHeadsForContext(contextType, contextId);
    clearPendingSocketSeqReconcileTimer(contextType, contextId);
    if (repairedStaleCursor || threadInvalidated) {
      const { persistLatestTailPagesAfterStaleCursor } = await import('./chatTailRecover');
      await persistLatestTailPagesAfterStaleCursor(contextType, contextId).catch(() => {});
      await syncLastMessageIdsToStoreFromLocalHeadsForContext(contextType, contextId);
    }
  });
}
