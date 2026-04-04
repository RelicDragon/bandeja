import type { ChatContextType, ChatMessage, ChatType, MessageReaction, MessageReadReceipt } from '@/api/chat';
import { chatCursorKey, chatLocalDb, type ChatLocalRow } from './chatLocalDb';
import { chatApi } from '@/api/chat';
import { chatSyncPullStarted, chatSyncPullEnded } from '@/services/chat/chatOfflineBanner';
import { dispatchChatSyncStale } from '@/utils/chatSyncStaleEvents';
import { recordChatSyncStaleDispatch } from '@/services/chat/chatSyncMetrics';
import { broadcastChatPullHint, ensureChatLocalCoopListener } from './chatLocalCoop';
import { patchThreadIndexAfterMessageDeleted, patchThreadIndexFromMessage } from './chatThreadIndex';
import {
  bumpMessageContextHead,
  refreshMessageContextHeadAfterDelete,
  syncLastMessageIdsToStoreFromLocalHeadsForContext,
} from './messageContextHead';
import { enqueueChatLocalContextApply } from './chatLocalApplyQueue';
import { purgeLocalDexieThread } from './chatLocalThreadPurge';
import { compareChatMessagesAscending, selectKLargestChatMessagesSorted } from '@/utils/chatMessageSort';
import { normalizeChatType } from '@/utils/chatType';
import { scheduleChatMediaThumbPrefetchForMessage } from '@/services/chat/chatMediaThumbPrefetch';
import { withChatSyncRetry } from '@/services/chat/chatHttpRetry';
import { fetchChatSyncEventsPackOffMainThread } from '@/services/chat/chatSyncFetchWorkerClient';
import { chatSyncEventsToPatches, mergeReactionListSync } from '@/services/chat/chatSyncEventsToPatches';
import { applyChatSyncPatchesInSlice } from '@/services/chat/chatSyncApplyPatches';
import { rowFromMessage } from '@/services/chat/chatSyncRowUtils';
import type { ChatSyncEventDTO } from '@/services/chat/chatSyncEventTypes';

export type { ChatSyncEventDTO };

ensureChatLocalCoopListener();

const socketSeqMissingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lastPullCompletedAtByKey = new Map<string, number>();
const PULL_COALESCE_MS = 450;
const SOCKET_SEQ_MISSING_BASE_MS = 1400;

function markChatPullCompleted(contextType: ChatContextType, contextId: string): void {
  lastPullCompletedAtByKey.set(chatCursorKey(contextType, contextId), Date.now());
}

function clearPendingSocketSeqReconcileTimer(contextType: ChatContextType, contextId: string): void {
  const key = chatCursorKey(contextType, contextId);
  const t = socketSeqMissingTimers.get(key);
  if (t != null) {
    clearTimeout(t);
    socketSeqMissingTimers.delete(key);
  }
}

function scheduleReconcileWhenSocketSeqMissing(contextType: ChatContextType, contextId: string): void {
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
      void import('./chatSyncScheduler').then((m) =>
        m.enqueueChatSyncPull(contextType, contextId, m.SYNC_PRIORITY_GAP)
      );
    }, SOCKET_SEQ_MISSING_BASE_MS + extra)
  );
}

let suppressLocalChatIndexingDepth = 0;

export async function withChatLocalBulkApply<T>(fn: () => Promise<T>): Promise<T> {
  suppressLocalChatIndexingDepth += 1;
  try {
    return await fn();
  } finally {
    suppressLocalChatIndexingDepth -= 1;
  }
}

function isChatLocalIndexingSuppressed(): boolean {
  return suppressLocalChatIndexingDepth > 0;
}

async function putLocalMessageDirect(m: ChatMessage): Promise<void> {
  const r = rowFromMessage(m);
  await chatLocalDb.messages.put(r);
  if (!isChatLocalIndexingSuppressed()) {
    void bumpMessageContextHead(r).catch(() => {});
    void patchThreadIndexFromMessage(m).catch(() => {});
  }
  if (m.thumbnailUrls?.some((u) => u && !u.startsWith('blob:') && !u.startsWith('data:'))) {
    scheduleChatMediaThumbPrefetchForMessage(m);
  }
}

export async function putLocalMessage(m: ChatMessage): Promise<void> {
  return enqueueChatLocalContextApply(m.chatContextType, m.contextId, () => putLocalMessageDirect(m));
}

export async function persistChatMessagesFromApi(messages: ChatMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const first = messages[0]!;
  return enqueueChatLocalContextApply(first.chatContextType, first.contextId, async () => {
    const rows: ChatLocalRow[] = [];
    await chatLocalDb.transaction('rw', chatLocalDb.messages, async () => {
      for (const m of messages) {
        const r = rowFromMessage(m);
        rows.push(r);
        await chatLocalDb.messages.put(r);
      }
    });
    for (const r of rows) {
      void bumpMessageContextHead(r).catch(() => {});
      const p = r.payload;
      if (p.thumbnailUrls?.some((u) => u && !u.startsWith('blob:') && !u.startsWith('data:'))) {
        scheduleChatMediaThumbPrefetchForMessage(p);
      }
    }
  });
}


export async function reconcileCursorWithServerHead(
  contextType: ChatContextType,
  contextId: string
): Promise<void> {
  try {
    const head = await chatApi.getChatSyncHead(contextType, contextId);
    const key = chatCursorKey(contextType, contextId);
    const local = (await chatLocalDb.chatSyncCursor.get(key))?.lastAppliedSeq ?? 0;
    if (head > local) {
      if (import.meta.env.DEV) {
        console.warn('[chatSync] server head ahead of applied cursor; scheduling pull', { contextType, contextId, head, local });
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

async function bumpCursor(contextType: ChatContextType, contextId: string, seq: number): Promise<void> {
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

async function markLocalMessageDeletedDirect(messageId: string, deletedAtIso?: string): Promise<void> {
  const row = await chatLocalDb.messages.get(messageId);
  if (!row) return;
  const iso = deletedAtIso ?? new Date().toISOString();
  await chatLocalDb.messages.put({
    ...row,
    deletedAt: new Date(iso).getTime(),
    payload: { ...row.payload, deletedAt: iso },
  });
  if (!isChatLocalIndexingSuppressed()) {
    void refreshMessageContextHeadAfterDelete(row.contextType, row.contextId, messageId, row.chatType).catch(
      () => {}
    );
    void patchThreadIndexAfterMessageDeleted(messageId).catch(() => {});
  }
}

export async function markLocalMessageDeleted(messageId: string, deletedAtIso?: string): Promise<void> {
  const peek = await chatLocalDb.messages.get(messageId);
  if (!peek) return;
  return enqueueChatLocalContextApply(peek.contextType, peek.contextId, () =>
    markLocalMessageDeletedDirect(messageId, deletedAtIso)
  );
}

export async function applyLocalMessageEditOptimistic(
  messageId: string,
  patch: { content: string; mentionIds: string[] }
): Promise<void> {
  const peek = await chatLocalDb.messages.get(messageId);
  if (!peek) return;
  const editedAt = new Date().toISOString();
  const nextPayload = { ...peek.payload, content: patch.content, mentionIds: patch.mentionIds, editedAt };
  return enqueueChatLocalContextApply(peek.contextType, peek.contextId, () => putLocalMessageDirect(nextPayload));
}

export async function applyLocalReactionOptimisticReplace(
  messageId: string,
  reactions: MessageReaction[]
): Promise<void> {
  const row = await chatLocalDb.messages.get(messageId);
  if (!row) return;
  return enqueueChatLocalContextApply(row.contextType, row.contextId, async () => {
    const fresh = await chatLocalDb.messages.get(messageId);
    if (!fresh) return;
    await chatLocalDb.messages.put({
      ...fresh,
      payload: { ...fresh.payload, reactions },
    });
  });
}

function schedulePullPageIndexHooks(events: ChatSyncEventDTO[]): void {
  void (async () => {
    for (const ev of events) {
      if (ev.eventType === 'MESSAGE_CREATED' || ev.eventType === 'MESSAGE_UPDATED') {
        const m = (ev.payload as { message?: ChatMessage }).message;
        if (m?.id) {
          const r = rowFromMessage(m);
          await bumpMessageContextHead(r).catch(() => {});
          await patchThreadIndexFromMessage(m).catch(() => {});
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

async function pullEventsLoop(contextType: ChatContextType, contextId: string): Promise<PullEventsLoopResult> {
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
        const { putMessagesForMedia } = await chatLocalDb.transaction(
          'rw',
          chatLocalDb.messages,
          chatLocalDb.chatSyncCursor,
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
    await putLocalMessageDirect(
      syncSeq != null ? { ...message, syncSeq } : message
    );
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

async function patchLocalTranscriptionDirect(
  messageId: string,
  audioTranscription: NonNullable<ChatMessage['audioTranscription']>
): Promise<void> {
  const row = await chatLocalDb.messages.get(messageId);
  if (!row) return;
  await chatLocalDb.messages.put({
    ...row,
    payload: { ...row.payload, audioTranscription },
  });
}

export async function patchLocalTranscription(
  messageId: string,
  audioTranscription: NonNullable<ChatMessage['audioTranscription']>
): Promise<void> {
  const row = await chatLocalDb.messages.get(messageId);
  if (!row) return;
  return enqueueChatLocalContextApply(row.contextType, row.contextId, () =>
    patchLocalTranscriptionDirect(messageId, audioTranscription)
  );
}

async function patchLocalReadReceiptDirect(readReceipt: {
  messageId: string;
  userId: string;
  readAt: string;
}): Promise<void> {
  const row = await chatLocalDb.messages.get(readReceipt.messageId);
  if (!row) return;
  const receipts = row.payload.readReceipts ?? [];
  const others = receipts.filter((r) => r.userId !== readReceipt.userId);
  const next: MessageReadReceipt = {
    id: `sock-${readReceipt.messageId}-${readReceipt.userId}`,
    messageId: readReceipt.messageId,
    userId: readReceipt.userId,
    readAt: readReceipt.readAt,
  };
  await chatLocalDb.messages.put({
    ...row,
    payload: { ...row.payload, readReceipts: [...others, next] },
  });
}

export async function patchLocalReadReceipt(readReceipt: {
  messageId: string;
  userId: string;
  readAt: string;
}): Promise<void> {
  const row = await chatLocalDb.messages.get(readReceipt.messageId);
  if (!row) return;
  return enqueueChatLocalContextApply(row.contextType, row.contextId, () => patchLocalReadReceiptDirect(readReceipt));
}

async function patchLocalPollDirect(messageId: string, poll: NonNullable<ChatMessage['poll']>): Promise<void> {
  const row = await chatLocalDb.messages.get(messageId);
  if (!row) return;
  await chatLocalDb.messages.put({
    ...row,
    payload: { ...row.payload, poll },
  });
}

export async function patchLocalPoll(messageId: string, poll: NonNullable<ChatMessage['poll']>): Promise<void> {
  const row = await chatLocalDb.messages.get(messageId);
  if (!row) return;
  return enqueueChatLocalContextApply(row.contextType, row.contextId, () => patchLocalPollDirect(messageId, poll));
}

async function persistReactionSocketPayloadDirect(reaction: {
  messageId?: string;
  userId?: string;
  action?: string;
  emoji?: string;
  id?: string;
  createdAt?: string;
  user?: MessageReaction['user'];
}): Promise<void> {
  if (!reaction.messageId) return;
  if (reaction.action === 'removed' && reaction.userId) {
    const row = await chatLocalDb.messages.get(reaction.messageId);
    if (!row) return;
    const reactions = (row.payload.reactions ?? []).filter((r) => r.userId !== reaction.userId);
    await chatLocalDb.messages.put({ ...row, payload: { ...row.payload, reactions } });
    return;
  }
  if (!reaction.userId || !reaction.emoji) return;
  const full: MessageReaction = {
    id: reaction.id ?? `tmp-${reaction.messageId}-${reaction.userId}`,
    messageId: reaction.messageId,
    userId: reaction.userId,
    emoji: reaction.emoji,
    createdAt: reaction.createdAt ?? new Date().toISOString(),
    user: (reaction.user ?? { id: reaction.userId, firstName: '', lastName: '' }) as MessageReaction['user'],
  };
  const row = await chatLocalDb.messages.get(reaction.messageId);
  if (!row) return;
  const reactions = mergeReactionListSync(row.payload.reactions ?? [], full);
  await chatLocalDb.messages.put({ ...row, payload: { ...row.payload, reactions } });
}

export async function persistReactionSocketPayload(reaction: {
  messageId?: string;
  userId?: string;
  action?: string;
  emoji?: string;
  id?: string;
  createdAt?: string;
  user?: MessageReaction['user'];
}): Promise<void> {
  if (!reaction.messageId) return;
  const row = await chatLocalDb.messages.get(reaction.messageId);
  if (!row) return;
  return enqueueChatLocalContextApply(row.contextType, row.contextId, () => persistReactionSocketPayloadDirect(reaction));
}

function compareMessagesStable(a: ChatMessage, b: ChatMessage): number {
  return compareChatMessagesAscending(a, b);
}

const LOCAL_THREAD_TAIL_FIRST = 48;

function yieldToMain(): Promise<void> {
  if (typeof requestIdleCallback !== 'undefined') {
    return new Promise((resolve) => {
      requestIdleCallback(() => resolve(), { timeout: 52 });
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function loadLocalMessagesForThread(
  contextType: ChatContextType,
  contextId: string,
  chatType: ChatType
): Promise<ChatMessage[]> {
  const ct = normalizeChatType(chatType);
  const rows = await chatLocalDb.messages
    .where('[contextType+contextId+chatType]')
    .equals([contextType, contextId, ct])
    .filter((r) => r.deletedAt == null)
    .toArray();
  const payloads = rows.map((r) => r.payload);
  payloads.sort(compareMessagesStable);
  return payloads;
}

export async function loadLocalMessagesForThreadProgressive(
  contextType: ChatContextType,
  contextId: string,
  chatType: ChatType,
  onTail: (tail: ChatMessage[]) => void
): Promise<ChatMessage[]> {
  const ct = normalizeChatType(chatType);
  const rows = await chatLocalDb.messages
    .where('[contextType+contextId+chatType]')
    .equals([contextType, contextId, ct])
    .filter((r) => r.deletedAt == null)
    .toArray();
  const payloads = rows.map((r) => r.payload);
  if (payloads.length <= LOCAL_THREAD_TAIL_FIRST) {
    payloads.sort(compareMessagesStable);
    return payloads;
  }
  const tail = selectKLargestChatMessagesSorted(payloads, LOCAL_THREAD_TAIL_FIRST);
  onTail(tail);
  await yieldToMain();
  payloads.sort(compareMessagesStable);
  return payloads;
}

export async function loadLocalMessagesOlderThan(
  contextType: ChatContextType,
  contextId: string,
  chatType: ChatType,
  beforeMessage: ChatMessage,
  limit: number
): Promise<ChatMessage[]> {
  const ct = normalizeChatType(chatType);
  const rows = await chatLocalDb.messages
    .where('[contextType+contextId+chatType]')
    .equals([contextType, contextId, ct])
    .filter(
      (r) => r.deletedAt == null && compareChatMessagesAscending(r.payload, beforeMessage) < 0
    )
    .toArray();
  rows.sort((a, b) => compareChatMessagesAscending(a.payload, b.payload));
  return rows.slice(-limit).map((r) => r.payload);
}
