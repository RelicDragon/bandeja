import type { ChatMessage, ChatMessageWithStatus } from '@/api/chat';
import { readReceiptsFingerprint } from '@/services/chat/readReceiptsFingerprint';
import {
  mergeChatMessagesAscending,
  mergeServerPageWithPendingOptimistics,
} from '@/utils/chatMessageSort';

export type ThreadScrollSnapshot = {
  atBottom?: boolean;
  anchorMessageId?: string;
};

export type ReconcileOpenDelta = {
  /** Older messages merged above the first visible row */
  prependedCount?: number;
};

export type OpenSnapshotSources = {
  l1: readonly ChatMessageWithStatus[];
  dexieTail: readonly ChatMessage[];
  outbox: readonly ChatMessageWithStatus[];
  l1Fresh: boolean;
  /** When false, L1 rows with optimistic / SENDING / FAILED are stripped before pick (A2.4). */
  includeL1Optimistics?: boolean;
  prev?: readonly ChatMessageWithStatus[];
};

export type OpenBootstrapInput = OpenSnapshotSources & {
  /** Coalesced open: one merge for L1 + Dexie tail + outbox */
  coalesceBootstrap?: boolean;
};

export type OpenBootstrapPlan = {
  paintCount: number;
  snapshot: ChatMessageWithStatus[];
};

function isExcludedFromL1(m: ChatMessageWithStatus): boolean {
  if (m._optimisticId) return true;
  if (m._status === 'SENDING' || m._status === 'FAILED') return true;
  return false;
}

function filterL1ForOpen(rows: readonly ChatMessageWithStatus[], includeOptimistics: boolean): ChatMessageWithStatus[] {
  if (includeOptimistics) return [...rows];
  return rows.filter((m) => !isExcludedFromL1(m));
}

/** Pick base rows for first paint: fresh L1 → else Dexie tail → else empty. */
export function pickOpenBaseMessages(sources: Pick<OpenSnapshotSources, 'l1' | 'dexieTail' | 'l1Fresh' | 'includeL1Optimistics'>): ChatMessageWithStatus[] {
  const includeOptimistics = sources.includeL1Optimistics === true;
  const l1 = filterL1ForOpen(sources.l1, includeOptimistics);
  if (sources.l1Fresh && l1.length > 0) return l1;
  if (sources.dexieTail.length > 0) {
    return sources.dexieTail.map((m) => ({ ...m })) as ChatMessageWithStatus[];
  }
  return [];
}

/** Single pre-paint snapshot: one source + outbox merged ascending (A2.1). */
export function buildOpenSnapshot(sources: OpenSnapshotSources): ChatMessageWithStatus[] {
  const base = pickOpenBaseMessages(sources);
  const prev = sources.prev ?? [];
  const withPrev =
    prev.length > 0 ? mergeServerPageWithPendingOptimistics([...prev], base) : base;
  if (sources.outbox.length === 0) return withPrev;
  return mergeServerPageWithPendingOptimistics(withPrev, sources.outbox as ChatMessage[]);
}

/** Keep in-flight optimistics when an open paint commits over a live thread. */
export function mergeOpenPaintWithLivePending(
  live: readonly ChatMessageWithStatus[],
  snapshot: readonly ChatMessageWithStatus[]
): ChatMessageWithStatus[] {
  const pending = live.filter((m) => {
    if (!m._optimisticId) return false;
    return m._status === 'SENDING' || m._status === 'FAILED';
  });
  if (pending.length === 0) return [...snapshot];
  return mergeServerPageWithPendingOptimistics(pending, [...snapshot]);
}

/** Reconcile / expand path: merge tail + outbox onto prev without full-thread replace. */
export function mergeOpenSnapshot(
  prev: readonly ChatMessageWithStatus[],
  tail: readonly ChatMessage[],
  outbox: readonly ChatMessageWithStatus[],
  _scroll?: ThreadScrollSnapshot
): ChatMessageWithStatus[] {
  void _scroll;
  const merged = mergeChatMessagesAscending([...prev], [...tail]);
  if (outbox.length === 0) return merged;
  return mergeServerPageWithPendingOptimistics(merged, outbox as ChatMessage[]);
}

/** Scroll pin policy for open reconcile (A3.4): no pin when anchor or prepend growth. */
export function shouldPinOnOpen(
  scroll: ThreadScrollSnapshot | undefined,
  reconcileDelta?: ReconcileOpenDelta
): boolean {
  if (scroll?.anchorMessageId) return false;
  if ((reconcileDelta?.prependedCount ?? 0) > 0) return false;
  if (scroll == null) return true;
  return scroll.atBottom === true;
}

function countPrepended(prev: readonly ChatMessageWithStatus[], merged: readonly ChatMessageWithStatus[]): number {
  if (prev.length === 0 || merged.length <= prev.length) return 0;
  const prevFirst = prev[0]!.id;
  const idx = merged.findIndex((m) => m.id === prevFirst);
  return idx > 0 ? idx : 0;
}

/** Legacy bootstrap issues multiple paints; coalesced path targets paintCount ≤ 1. */
export function planOpenBootstrapPaints(input: OpenBootstrapInput): OpenBootstrapPlan {
  const coalesce = input.coalesceBootstrap !== false;
  if (coalesce) {
    const snapshot = buildOpenSnapshot(input);
    const hasData =
      snapshot.length > 0 ||
      input.outbox.length > 0 ||
      (input.l1Fresh && filterL1ForOpen(input.l1, input.includeL1Optimistics === true).length > 0) ||
      input.dexieTail.length > 0;
    return { paintCount: hasData ? 1 : 0, snapshot };
  }

  let paintCount = 0;
  let messages: ChatMessageWithStatus[] = [];
  const l1 = filterL1ForOpen(input.l1, input.includeL1Optimistics === true);
  if (input.l1Fresh && l1.length > 0) {
    messages = [...l1];
    paintCount += 1;
  }
  if (input.dexieTail.length > 0) {
    messages = mergeServerPageWithPendingOptimistics(messages, [...input.dexieTail]);
    paintCount += 1;
  }
  if (input.outbox.length > 0) {
    messages = mergeServerPageWithPendingOptimistics(messages, input.outbox as ChatMessage[]);
    paintCount += 1;
  }
  return { paintCount, snapshot: messages };
}

/** Ordered id equality — skip redundant open paints when snapshot unchanged. */
export function chatOpenMessageIdsEqual(
  a: readonly { id: string }[],
  b: readonly { id: string }[]
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.id !== b[i]!.id) return false;
  }
  return true;
}

/** Id + updatedAt + read receipts — reconcile may refresh bodies/receipts without changing row count. */
export function chatOpenMessagesSnapshotEqual(
  a: readonly ChatMessageWithStatus[],
  b: readonly ChatMessageWithStatus[]
): boolean {
  if (!chatOpenMessageIdsEqual(a, b)) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.updatedAt !== b[i]!.updatedAt) return false;
    if (readReceiptsFingerprint(a[i]!.readReceipts) !== readReceiptsFingerprint(b[i]!.readReceipts)) {
      return false;
    }
  }
  return true;
}

/** Full local tail loaded — unlikely older pages exist unless backfill says otherwise. */
export function chatOpenLikelyHasOlderMessages(paintedCount: number, pageSize: number): boolean {
  return paintedCount >= pageSize;
}

export function reconcileOpenDelta(
  prev: readonly ChatMessageWithStatus[],
  next: readonly ChatMessageWithStatus[]
): ReconcileOpenDelta {
  return { prependedCount: countPrepended(prev, next) };
}
