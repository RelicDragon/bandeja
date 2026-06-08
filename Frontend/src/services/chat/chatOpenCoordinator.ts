/**
 * Chat open coordinator — contracts and pure helpers for game-chat-open-performance.
 *
 * **Placement (A0.3):** Pure async / pure functions here (no React). `useThreadMessages` is the
 * hook wrapper: L1 layout seed, bootstrap, reconcile, traced `setMessages`.
 *
 * Bootstrap merge lives in `threadOpen/planThreadOpen`; this module re-exports contracts and
 * thin-delegates `openThreadBootstrap`.
 *
 * **Window alignment (A0.4):**
 * - First paint row count = Dexie bootstrap tail (`CHAT_LOCAL_THREAD_WINDOW_SIZE`, ~50).
 * - L1: up to ~400 rows, excludes SENDING/FAILED unless `includeL1Optimistics`; use when TTL-fresh.
 * - Full `loadLocalMessagesForThread` is not default open (scroll-up / explicit only).
 * - `paintSource`: `l1` | `dexie-tail` | `network`.
 */
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
import { planThreadOpen } from '@/services/chat/threadOpen/planThreadOpen';
import type { OpenThreadPlan, ThreadOpenInputs } from '@/services/chat/threadOpen/types';

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

export type {
  OpenThreadPaintSource,
  OpenThreadPlan,
  OpenThreadScroll,
} from '@/services/chat/threadOpen/types';

/** Single Dexie read per open — coordinator owns scroll for the open window. */
export async function loadOpenScrollState(key: string): Promise<ThreadScrollRow | undefined> {
  return getThreadScrollState(key);
}

export type OpenThreadBootstrapInput = ThreadOpenInputs & {
  threadKey: string;
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
  const result = await planThreadOpen(input.threadKey, input);
  if (result.kind === 'empty') {
    return { kind: 'empty' };
  }
  return {
    kind: 'painted',
    plan: result.plan,
    setMessagesSource: result.setMessagesSource,
  };
}
