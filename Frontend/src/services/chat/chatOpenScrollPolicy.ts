import type { ThreadScrollRow } from '@/services/chat/chatThreadScroll';

export type ReconcileScrollDelta = 'none' | 'prepend' | 'append';

export type ThreadInitialScroll =
  | { atBottom: true }
  | { anchorMessageId: string };

export function toInitialScrollProp(scroll: ThreadScrollRow | undefined): ThreadInitialScroll {
  if (scroll?.anchorMessageId) {
    return { anchorMessageId: scroll.anchorMessageId };
  }
  return { atBottom: true };
}

export function shouldPinOnOpen(
  scroll: Pick<ThreadScrollRow, 'atBottom' | 'anchorMessageId'> | undefined,
  reconcileDelta: ReconcileScrollDelta
): boolean {
  if (scroll?.anchorMessageId) return false;
  if (reconcileDelta === 'prepend') return false;
  if (scroll && scroll.atBottom === false) return false;
  return true;
}

export function detectReconcileScrollDelta(
  beforeLen: number,
  beforeFirstId: string | undefined,
  afterLen: number,
  afterFirstId: string | undefined
): ReconcileScrollDelta {
  if (afterLen > beforeLen && afterFirstId !== beforeFirstId) return 'prepend';
  if (afterLen > beforeLen) return 'append';
  return 'none';
}
