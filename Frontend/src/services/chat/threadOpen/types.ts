import type { ChatMessage, ChatMessageWithStatus } from '@/api/chat';
import type { ThreadScrollPosition } from '@/services/chat/chatThreadScroll';
import type { ChatOpenSetMessagesSource } from '@/services/chat/chatOpenTrace';

/**
 * ThreadOpen bootstrap invariants:
 *
 * | Invariant | Rule |
 * |-----------|------|
 * | Pre-paint `setMessages` | `paintGeneration` is **0 or 1** only (coalesced bootstrap) |
 * | Bootstrap window | Dexie tail capped at `CHAT_LOCAL_THREAD_WINDOW_SIZE`; L1 may hold more |
 * | Merge order | L1 base → Dexie tail → outbox optimistics (outbox last) |
 * | L1 optimistics | Stripped on open unless caller opts into `includeL1Optimistics` |
 * | `peekPrev` timing | Read **after** async `loadBootstrap` / outbox so in-flight sends stay in snapshot |
 * | `paintSource` | `l1` when fresh L1 non-empty; else `dexie-tail`; else `network` (empty-tail fallback) |
 */

export type ThreadOpenKey = string;

export type OpenThreadPaintSource = 'l1' | 'dexie-tail' | 'network';

export type OpenThreadScroll =
  | { atBottom: true }
  | { anchorMessageId: string };

export type OpenThreadPlan = {
  threadKey: string;
  messages: ChatMessageWithStatus[];
  scroll: OpenThreadScroll;
  scrollRow: ThreadScrollPosition | undefined;
  paintSource: OpenThreadPaintSource;
  deferSync: boolean;
};

export type ThreadOpenInputs = {
  peekL1: () => readonly ChatMessageWithStatus[];
  /** Read after async loads so sends during bootstrap stay in the snapshot. */
  peekPrev: () => readonly ChatMessageWithStatus[];
  loadBootstrap: () => Promise<{ messages: ChatMessage[] }>;
  loadOutboxOptimistics?: () => Promise<readonly ChatMessageWithStatus[]>;
  forceFreshOpen?: boolean;
  openAnchorMessageId?: string;
};

export type ThreadOpenScrollPlan = {
  scroll: OpenThreadScroll;
  scrollRow: ThreadScrollPosition | undefined;
};

export type ThreadOpenPlanResult =
  | { kind: 'empty'; paintGeneration: 0 }
  | {
      kind: 'painted';
      rows: ChatMessageWithStatus[];
      scrollPlan: ThreadOpenScrollPlan;
      paintGeneration: 1;
      paintSource: OpenThreadPaintSource;
      setMessagesSource: ChatOpenSetMessagesSource;
      plan: OpenThreadPlan;
    };

export type ThreadOpenMergeInput = {
  l1: readonly ChatMessageWithStatus[];
  dexieTail: readonly ChatMessage[];
  outbox: readonly ChatMessageWithStatus[];
  prev: readonly ChatMessageWithStatus[];
  l1Fresh: boolean;
};

export type ThreadOpenMergeResult = {
  rows: ChatMessageWithStatus[];
  paintGeneration: 0 | 1;
  paintSource: OpenThreadPaintSource;
};
