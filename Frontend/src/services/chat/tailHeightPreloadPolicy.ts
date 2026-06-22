import type { ThreadInitialScroll } from '@/services/chat/chatOpenScrollPolicy';

export const TAIL_HEIGHT_PRELOAD_NEAR_BOTTOM_PX = 120;
export const TAIL_HEIGHT_PRELOAD_DEBOUNCE_MS = 150;
export const TAIL_HEIGHT_PRELOAD_LIMIT = 140;

export function inferTailPreloadNearBottomOnOpen(initialScroll: ThreadInitialScroll | undefined): boolean {
  if (initialScroll === undefined) return true;
  return 'atBottom' in initialScroll && initialScroll.atBottom;
}

export function isTailHeightPreloadNearBottom(
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
  thresholdPx = TAIL_HEIGHT_PRELOAD_NEAR_BOTTOM_PX
): boolean {
  return scrollHeight - scrollTop - clientHeight < thresholdPx;
}

/** DOM read with fallback to open scroll plan before the list is scrollable. */
export function readTailHeightPreloadNearBottom(
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
  initialScroll: ThreadInitialScroll | undefined
): boolean {
  if (scrollHeight <= clientHeight + 1) {
    return inferTailPreloadNearBottomOnOpen(initialScroll);
  }
  return isTailHeightPreloadNearBottom(scrollHeight, scrollTop, clientHeight);
}

/** Allow tail cache seed/preload when pinned at bottom or during open-at-bottom settling. */
export function shouldRunTailHeightPreload(params: {
  nearBottom: boolean;
  openAtBottom: boolean;
  layoutSettling: boolean;
}): boolean {
  if (params.nearBottom) return true;
  if (params.openAtBottom && params.layoutSettling) return true;
  return false;
}
