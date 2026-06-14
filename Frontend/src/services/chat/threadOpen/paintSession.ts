import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { ChatContextType, ChatMessageWithStatus } from '@/api/chat';
import type { ChatType } from '@/types';
import type { ThreadScrollRow } from '@/services/chat/chatThreadScroll';
import {
  applyThreadEvent,
  loadLocalThreadBootstrap,
  pullAndApplyChatSyncEvents,
} from '@/services/chat/chatLocalApply';
import { hydrateLastMessageIdFromDexieIfMissing } from '@/services/chat/messageContextHead';
import { pullMissedAndPersistToDexie } from '@/services/chat/chatThreadNetworkSync';
import { takeMissedMessagesForOpen } from '@/services/chat/chatOpenMissedFlush';
import { useChatSyncStore } from '@/store/chatSyncStore';
import { enqueueChatSyncPull, SYNC_PRIORITY_FOREGROUND } from '@/services/chat/chatSyncScheduler';
import { chatOpenMessagesSnapshotEqual, mergeOpenSnapshot } from '@/services/chat/chatOpenSnapshot';
import {
  detectReconcileScrollDelta,
  type ReconcileScrollDelta,
} from '@/services/chat/chatOpenScrollPolicy';
import { decideReconcilePinApply } from '@/services/chat/threadScrollPolicy';
import { commitChatOpenMessages, traceChatOpenLength } from '@/services/chat/chatOpenTrace';
import { consumeOpenThreadNetworkPrefetch } from '@/services/chat/openThreadNetworkPrefetch';

/** Socket backlog + open reload guard after first paint commit. */
export const THREAD_OPEN_SOCKET_GUARD_MS = 300;

export type ThreadOpenReconcileParams = {
  threadKey: string;
  paintGeneration?: number;
  contextType: ChatContextType;
  contextId: string;
  gameChatType: ChatType;
  currentIdRef: RefObject<string | undefined>;
  messagesRef: RefObject<ChatMessageWithStatus[]>;
  setMessages: Dispatch<SetStateAction<ChatMessageWithStatus[]>>;
  scrollRow?: ThreadScrollRow;
};

export type ThreadOpenReconcileResult = {
  committedRows: boolean;
  pinToBottom: boolean;
  reconcileDelta: ReconcileScrollDelta;
};

type ThreadOpenPaintSession = {
  threadKey: string;
  paintGeneration: number;
  paintCommittedAt: number | null;
  settling: boolean;
  scrollRow: ThreadScrollRow | undefined;
};

let paintSession: ThreadOpenPaintSession | null = null;
let openReconcileGeneration = 0;

function isActiveOpenReconcile(generation: number): boolean {
  return generation === openReconcileGeneration;
}

export function resetThreadOpenPaint(threadKey: string): void {
  paintSession = {
    threadKey,
    paintGeneration: 0,
    paintCommittedAt: null,
    settling: true,
    scrollRow: undefined,
  };
}

export function beginThreadOpenSettling(): void {
  if (paintSession) paintSession.settling = true;
}

export function endThreadOpenSettling(): void {
  if (paintSession) paintSession.settling = false;
}

export function isThreadOpenSettling(): boolean {
  return paintSession?.settling ?? true;
}

export function commitThreadOpenPaint(threadKey: string, scrollRow?: ThreadScrollRow): number {
  const nextGen = (paintSession?.threadKey === threadKey ? paintSession.paintGeneration : 0) + 1;
  paintSession = {
    threadKey,
    paintGeneration: nextGen,
    paintCommittedAt: Date.now(),
    settling: true,
    scrollRow,
  };
  return nextGen;
}

export function getThreadOpenPaintGeneration(threadKey: string): number {
  if (paintSession?.threadKey !== threadKey) return 0;
  return paintSession.paintGeneration;
}

export function isThreadOpenPaintCommitted(threadKey: string): boolean {
  return paintSession?.threadKey === threadKey && paintSession.paintCommittedAt != null;
}

export function msSinceThreadOpenPaintCommit(): number | null {
  if (paintSession?.paintCommittedAt == null) return null;
  return Date.now() - paintSession.paintCommittedAt;
}

/** Socket room backlog may flush after open paint commits, settling ends, and guard elapses. */
export function canFlushSocketBacklog(threadKey: string): boolean {
  if (!isThreadOpenPaintCommitted(threadKey)) return false;
  if (paintSession?.settling) return false;
  const elapsed = msSinceThreadOpenPaintCommit();
  return elapsed != null && elapsed >= THREAD_OPEN_SOCKET_GUARD_MS;
}

/** Block full first-page reload briefly after open paint to avoid scroll flash. */
export function shouldDeferOpenReload(): boolean {
  if (paintSession?.paintCommittedAt == null) return false;
  const elapsed = msSinceThreadOpenPaintCommit();
  return elapsed != null && elapsed < THREAD_OPEN_SOCKET_GUARD_MS;
}

export function getThreadOpenScrollRow(): ThreadScrollRow | undefined {
  return paintSession?.scrollRow;
}

function resolvePinAfterReconcile(
  scrollRow: ThreadScrollRow | undefined,
  before: readonly ChatMessageWithStatus[],
  after: readonly ChatMessageWithStatus[]
): boolean {
  const scrollDelta = detectReconcileScrollDelta(
    before.length,
    before[0]?.id,
    after.length,
    after[0]?.id
  );
  return decideReconcilePinApply({ savedScroll: scrollRow, reconcileDelta: scrollDelta }).kind === 'pin-bottom';
}

/** Post-open reconcile — missed pull, sync events, tail merge; single commit. */
export async function reconcileAfterPaint(
  params: ThreadOpenReconcileParams
): Promise<ThreadOpenReconcileResult> {
  const {
    threadKey,
    paintGeneration,
    contextType,
    contextId,
    gameChatType,
    currentIdRef,
    messagesRef,
    setMessages,
    scrollRow = getThreadOpenScrollRow(),
  } = params;

  const noop: ThreadOpenReconcileResult = {
    committedRows: false,
    pinToBottom: false,
    reconcileDelta: 'none',
  };

  if (currentIdRef.current !== contextId) return noop;

  const generation = ++openReconcileGeneration;
  useChatSyncStore.getState().setOpenSyncing(true);

  const before = messagesRef.current;
  const beforeLen = before.length;
  const beforeFirstId = before[0]?.id;

  await hydrateLastMessageIdFromDexieIfMissing(
    contextType,
    contextId,
    contextType === 'GAME' ? gameChatType : undefined
  );

  try {
    if (currentIdRef.current !== contextId) return noop;

    const missedBuffer = takeMissedMessagesForOpen(
      contextType,
      contextId,
      contextType === 'GAME' ? gameChatType : undefined
    );
    const skipNetworkPull = consumeOpenThreadNetworkPrefetch(contextType, contextId);
    let missedNetwork: Awaited<ReturnType<typeof pullMissedAndPersistToDexie>> = [];
    if (!skipNetworkPull) {
      missedNetwork = await pullMissedAndPersistToDexie({
        contextType,
        contextId,
        gameChatType: contextType === 'GAME' ? gameChatType : undefined,
      });
      if (currentIdRef.current !== contextId) return noop;

      await pullAndApplyChatSyncEvents(contextType, contextId);
      if (currentIdRef.current !== contextId) return noop;
    }

    const { messages: dexieTail } = await loadLocalThreadBootstrap(contextType, contextId, gameChatType);
    if (currentIdRef.current !== contextId) return noop;

    const stalePaint =
      paintGeneration != null &&
      paintSession?.threadKey === threadKey &&
      paintGeneration !== paintSession.paintGeneration;

    let committedRows = false;
    if (currentIdRef.current === contextId && isActiveOpenReconcile(generation) && !stalePaint) {
      // Re-read live rows: send-success / socket may have updated the thread while we pulled.
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

      if (!chatOpenMessagesSnapshotEqual(messagesRef.current, next)) {
        commitChatOpenMessages(messagesRef, (v) => setMessages(v), next, 'reconcile-batched');
        traceChatOpenLength('afterReconcile', next.length);
        await applyThreadEvent({ kind: 'syncTailsFromHeads', contextType, contextId });
        committedRows = true;
      }
    }

    const after = messagesRef.current;
    const reconcileDelta = detectReconcileScrollDelta(
      beforeLen,
      beforeFirstId,
      after.length,
      after[0]?.id
    );

    return {
      committedRows,
      pinToBottom: resolvePinAfterReconcile(scrollRow, before, after),
      reconcileDelta,
    };
  } catch {
    void enqueueChatSyncPull(contextType, contextId, SYNC_PRIORITY_FOREGROUND);
    return noop;
  } finally {
    if (isActiveOpenReconcile(generation)) {
      useChatSyncStore.getState().setOpenSyncing(false);
    }
  }
}
