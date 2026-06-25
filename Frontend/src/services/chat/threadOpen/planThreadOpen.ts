import type { ChatMessageWithStatus } from '@/api/chat';
import { getThreadScrollState, type ThreadScrollRow } from '@/services/chat/chatThreadScroll';
import { planOpenBootstrapPaints } from '@/services/chat/chatOpenSnapshot';
import { resolvePaintScrollPlan } from '@/services/chat/threadSession';
import type {
  ThreadOpenKey,
  ThreadOpenInputs,
  ThreadOpenMergeInput,
  ThreadOpenMergeResult,
  ThreadOpenPlanResult,
  ThreadOpenScrollPlan,
} from '@/services/chat/threadOpen/types';

/**
 * Pure merge: L1 → Dexie tail → outbox → prev peek.
 * Enforces ≤1 pre-paint commit via `planOpenBootstrapPaints({ coalesceBootstrap: true })`.
 */
export function mergeThreadOpenRows(input: ThreadOpenMergeInput): ThreadOpenMergeResult {
  const { snapshot, paintCount } = planOpenBootstrapPaints({
    l1: input.l1,
    dexieTail: input.dexieTail,
    outbox: input.outbox,
    l1Fresh: input.l1Fresh,
    prev: input.prev,
    coalesceBootstrap: true,
    includeL1Optimistics: false,
  });
  const paintGeneration = paintCount > 0 ? 1 : 0;
  const paintSource =
    input.l1Fresh && input.l1.length > 0
      ? 'l1'
      : input.dexieTail.length > 0
        ? 'dexie-tail'
        : 'network';
  return { rows: snapshot, paintGeneration, paintSource };
}

export function resolveThreadOpenScrollPlan(input: {
  messages: readonly ChatMessageWithStatus[];
  storedScroll?: ThreadScrollRow;
  forceFreshOpen: boolean;
  openAnchorMessageId?: string;
}): ThreadOpenScrollPlan {
  const scroll = resolvePaintScrollPlan({
    messages: input.messages,
    storedScroll: input.storedScroll,
    forceFreshOpen: input.forceFreshOpen,
    openAnchorMessageId: input.openAnchorMessageId,
  });
  const clearedRow = input.forceFreshOpen ? undefined : input.storedScroll;
  return {
    scroll:
      'anchorMessageId' in scroll
        ? { anchorMessageId: scroll.anchorMessageId }
        : { atBottom: true },
    scrollRow: clearedRow,
  };
}

/**
 * Async bootstrap planner: peek L1 → load Dexie tail → load outbox → merge → scroll plan.
 * Returns `{ kind: 'empty', paintGeneration: 0 }` when no local rows; otherwise one painted plan.
 */
export async function planThreadOpen(
  threadKey: ThreadOpenKey,
  inputs: ThreadOpenInputs
): Promise<ThreadOpenPlanResult> {
  const l1 = [...inputs.peekL1()];
  const bootstrap = await inputs.loadBootstrap();
  const dexieTail = bootstrap.messages;
  const hasOlderInDexie = bootstrap.hasOlderInDexie ?? false;
  const outbox = inputs.loadOutboxOptimistics
    ? [...(await inputs.loadOutboxOptimistics())]
    : [];
  const prev = [...inputs.peekPrev()];
  const l1Fresh = l1.length > 0;
  const merged = mergeThreadOpenRows({ l1, dexieTail, outbox, prev, l1Fresh });

  if (merged.paintGeneration === 0 && merged.rows.length === 0) {
    return { kind: 'empty', paintGeneration: 0 };
  }

  const scrollState = await getThreadScrollState(threadKey);
  const scrollPlan = resolveThreadOpenScrollPlan({
    messages: merged.rows,
    storedScroll: scrollState,
    forceFreshOpen: inputs.forceFreshOpen === true,
    openAnchorMessageId: inputs.openAnchorMessageId,
  });

  return {
    kind: 'painted',
    rows: merged.rows,
    scrollPlan,
    paintGeneration: 1,
    paintSource: merged.paintSource,
    setMessagesSource: 'bootstrap-snapshot',
    plan: {
      threadKey,
      messages: merged.rows,
      scroll: scrollPlan.scroll,
      scrollRow: scrollPlan.scrollRow,
      paintSource: merged.paintSource,
      deferSync: true,
      hasOlderInDexie,
    },
  };
}
