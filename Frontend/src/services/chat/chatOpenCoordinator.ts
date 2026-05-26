/**
 * Chat open coordinator — contracts and pure helpers for game-chat-open-performance.
 *
 * **Placement (A0.3):** Pure async / pure functions here (no React). `useGameChatMessages` is the
 * hook wrapper: L1 layout seed, bootstrap, reconcile, traced `setMessages`.
 *
 * **Window alignment (A0.4):**
 * - First paint row count = Dexie bootstrap tail (`CHAT_LOCAL_THREAD_WINDOW_SIZE`, ~50).
 * - L1: up to ~400 rows, excludes SENDING/FAILED unless `includeL1Optimistics`; use when TTL-fresh.
 * - Full `loadLocalMessagesForThread` is not default open (scroll-up / explicit only).
 * - `paintSource`: `l1` | `dexie-tail` | `network`.
 */
import type { ChatMessage, ChatMessageWithStatus } from '@/api/chat';
import type { ThreadScrollRow } from '@/services/chat/chatThreadScroll';
import { getThreadScrollState } from '@/services/chat/chatThreadScroll';
import {
  buildOpenSnapshot,
  mergeOpenSnapshot,
  planOpenBootstrapPaints,
  pickOpenBaseMessages,
  type OpenBootstrapInput,
} from '@/services/chat/chatOpenSnapshot';
import type { ChatOpenSetMessagesSource } from '@/services/chat/chatOpenTrace';

export type { ReconcileScrollDelta, ThreadInitialScroll } from '@/services/chat/chatOpenScrollPolicy';
export {
  detectReconcileScrollDelta,
  shouldPinOnOpen,
  toInitialScrollProp,
} from '@/services/chat/chatOpenScrollPolicy';

export {
  buildOpenSnapshot,
  mergeOpenSnapshot,
  planOpenBootstrapPaints,
  pickOpenBaseMessages,
  type OpenBootstrapInput,
};

export type OpenThreadPaintSource = 'l1' | 'dexie-tail' | 'network';

export type OpenThreadScroll =
  | { atBottom: true }
  | { anchorMessageId: string };

export type OpenThreadPlan = {
  threadKey: string;
  messages: ChatMessageWithStatus[];
  scroll: OpenThreadScroll;
  /** Dexie scroll row from the single open-window read (for shouldPinOnOpen). */
  scrollRow: ThreadScrollRow | undefined;
  paintSource: OpenThreadPaintSource;
  deferSync: boolean;
};

/** Single Dexie read per open — coordinator owns scroll for the open window. */
export async function loadOpenScrollState(key: string): Promise<ThreadScrollRow | undefined> {
  return getThreadScrollState(key);
}

function scrollRowToOpenScroll(row: ThreadScrollRow | undefined): OpenThreadScroll {
  if (row?.anchorMessageId) return { anchorMessageId: row.anchorMessageId };
  return { atBottom: true };
}

export type OpenThreadBootstrapInput = {
  threadKey: string;
  peekL1: () => readonly ChatMessageWithStatus[];
  prev: readonly ChatMessageWithStatus[];
  loadBootstrap: () => Promise<{ messages: ChatMessage[] }>;
  loadOutboxOptimistics?: () => Promise<readonly ChatMessageWithStatus[]>;
};

export type OpenThreadBootstrapResult =
  | { kind: 'empty' }
  | {
      kind: 'painted';
      plan: OpenThreadPlan;
      setMessagesSource: ChatOpenSetMessagesSource;
    };

/** One coalesced bootstrap paint when local data exists. */
export async function openThreadBootstrap(
  input: OpenThreadBootstrapInput
): Promise<OpenThreadBootstrapResult> {
  const l1 = [...input.peekL1()];
  const { messages: dexieTail } = await input.loadBootstrap();
  const outbox = input.loadOutboxOptimistics ? [...(await input.loadOutboxOptimistics())] : [];
  const l1Fresh = l1.length > 0;
  const { snapshot, paintCount } = planOpenBootstrapPaints({
    l1,
    dexieTail,
    outbox,
    l1Fresh,
    prev: input.prev,
    coalesceBootstrap: true,
    includeL1Optimistics: false,
  });
  if (paintCount === 0 && snapshot.length === 0) {
    return { kind: 'empty' };
  }
  const scrollState = await loadOpenScrollState(input.threadKey);
  const paintSource: OpenThreadPaintSource = l1Fresh ? 'l1' : dexieTail.length > 0 ? 'dexie-tail' : 'network';
  return {
    kind: 'painted',
    plan: {
      threadKey: input.threadKey,
      messages: snapshot,
      scroll: scrollRowToOpenScroll(scrollState),
      scrollRow: scrollState,
      paintSource,
      deferSync: true,
    },
    setMessagesSource: 'bootstrap-snapshot',
  };
}
