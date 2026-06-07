import type { ThreadInitialScroll, ReconcileScrollDelta } from '@/services/chat/chatOpenScrollPolicy';
import { shouldPinOnOpen } from '@/services/chat/chatOpenScrollPolicy';
import type { ThreadScrollRow } from '@/services/chat/chatThreadScroll';

export type ScrollApplyKind =
  | 'none'
  | 'open-restore'
  | 'pin-bottom'
  | 'pin-bottom-settling'
  | 'prepend-compensate'
  | 'append-pin-if-at-bottom';

export interface ScrollApplyDecision {
  kind: ScrollApplyKind;
  anchorMessageId?: string;
}

export interface DecideOpenScrollParams {
  initialScroll: ThreadInitialScroll | undefined;
  openPaintGeneration: number;
  alreadyRestored: boolean;
}

export interface DecideNewMessagesScrollParams {
  isNewMessagesAdded: boolean;
  wasLoadingMore: boolean;
  justLoadedOlder: boolean;
  isPrependReconcile: boolean;
  layoutSettlingForBottomPin: boolean;
  wasAtBottom: boolean;
}

export interface DecideReconcilePinParams {
  savedScroll: Pick<ThreadScrollRow, 'atBottom' | 'anchorMessageId'> | undefined;
  reconcileDelta: ReconcileScrollDelta;
}

/** Whether open scroll restore should run for this paint generation. */
export function decideOpenScrollApply(params: DecideOpenScrollParams): ScrollApplyDecision {
  const { initialScroll, alreadyRestored } = params;
  if (initialScroll === undefined || alreadyRestored) return { kind: 'none' };
  if ('atBottom' in initialScroll && initialScroll.atBottom) {
    return { kind: 'open-restore' };
  }
  const anchorId = 'anchorMessageId' in initialScroll ? initialScroll.anchorMessageId : undefined;
  if (anchorId) return { kind: 'open-restore', anchorMessageId: anchorId };
  return { kind: 'none' };
}

/** Pin during settling ResizeObserver loop. */
export function decideSettlingPinApply(
  layoutSettlingForBottomPin: boolean,
  openScrollAtBottom: boolean
): ScrollApplyDecision {
  if (!layoutSettlingForBottomPin || !openScrollAtBottom) return { kind: 'none' };
  return { kind: 'pin-bottom-settling' };
}

/** After reconcile / socket merge — honor saved scroll + delta policy. */
export function decideReconcilePinApply(params: DecideReconcilePinParams): ScrollApplyDecision {
  const { savedScroll, reconcileDelta } = params;
  if (!shouldPinOnOpen(savedScroll, reconcileDelta)) return { kind: 'none' };
  return { kind: 'pin-bottom' };
}

/** New messages appended/prepended — scroll compensation or tail pin. */
export function decideNewMessagesScrollApply(params: DecideNewMessagesScrollParams): ScrollApplyDecision {
  const {
    isNewMessagesAdded,
    wasLoadingMore,
    justLoadedOlder,
    isPrependReconcile,
    layoutSettlingForBottomPin,
    wasAtBottom,
  } = params;
  if (!isNewMessagesAdded) return { kind: 'none' };
  if (wasLoadingMore || justLoadedOlder || isPrependReconcile) {
    return { kind: 'prepend-compensate' };
  }
  if (layoutSettlingForBottomPin) return { kind: 'none' };
  if (wasAtBottom) return { kind: 'append-pin-if-at-bottom' };
  return { kind: 'none' };
}

/** Unified entry for MessageList adapter. */
export function decideScrollApply(
  scenario: 'open' | 'settling' | 'reconcile' | 'new-messages',
  params:
    | DecideOpenScrollParams
    | { layoutSettlingForBottomPin: boolean; openScrollAtBottom: boolean }
    | DecideReconcilePinParams
    | DecideNewMessagesScrollParams
): ScrollApplyDecision {
  switch (scenario) {
    case 'open':
      return decideOpenScrollApply(params as DecideOpenScrollParams);
    case 'settling': {
      const p = params as { layoutSettlingForBottomPin: boolean; openScrollAtBottom: boolean };
      return decideSettlingPinApply(p.layoutSettlingForBottomPin, p.openScrollAtBottom);
    }
    case 'reconcile':
      return decideReconcilePinApply(params as DecideReconcilePinParams);
    case 'new-messages':
      return decideNewMessagesScrollApply(params as DecideNewMessagesScrollParams);
    default:
      return { kind: 'none' };
  }
}
