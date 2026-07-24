/** Whether open-at-bottom / append-pin intent should clear after a viewport observation. */
export function shouldClearOpenAtBottomIntent(params: {
  layoutSettling: boolean;
  nearBottom: boolean;
  programmaticScroll: boolean;
}): boolean {
  if (params.layoutSettling || params.programmaticScroll) return false;
  return !params.nearBottom;
}

/**
 * Scroll+resize share one listener. Height growth under a pinned tail can briefly look
 * mid-history without scrollTop moving — re-pin instead of releasing intent.
 * Real user scroll away always releases, including during open settling (otherwise
 * settling RO pins fight the user reading history while hydrate finishes).
 */
export function shouldReleaseBottomIntentOnViewportTick(params: {
  layoutSettling: boolean;
  programmaticScroll: boolean;
  nearBottom: boolean;
  scrollMoved: boolean;
  heightGrew: boolean;
  openAtBottomIntent: boolean;
}): 'keep' | 'release' | 'repin' {
  if (params.programmaticScroll) return 'keep';
  if (params.nearBottom) return 'keep';
  if (params.scrollMoved) return 'release';
  if (params.layoutSettling) {
    if (params.heightGrew && params.openAtBottomIntent) return 'repin';
    return 'keep';
  }
  if (params.heightGrew && params.openAtBottomIntent) return 'repin';
  if (!params.heightGrew) return 'release';
  return 'keep';
}

/**
 * Adopt `{ atBottom: true }` from open plan only on first paint for the thread,
 * or while intent is still live — never resurrect after the user left the tail.
 */
export function shouldAdoptOpenAtBottomFromInitialScroll(params: {
  initialScrollAtBottom: boolean;
  userReleasedBottomIntent: boolean;
}): boolean {
  if (!params.initialScrollAtBottom) return false;
  return !params.userReleasedBottomIntent;
}

/** Initial-load tail pin: only smooth-pin when still near bottom (never force-align mid-history). */
export function decideInitialLoadTailPin(params: {
  openAtBottom: boolean;
  nearBottom: boolean;
}): 'smooth' | 'none' {
  if (!params.openAtBottom || !params.nearBottom) return 'none';
  return 'smooth';
}

/** After open settling ends, only re-pin if open-at-bottom intent remains and viewport is still at tail. */
export function shouldPinAfterSettlingEnds(params: {
  openAtBottom: boolean;
  nearBottom: boolean;
}): boolean {
  return params.openAtBottom && params.nearBottom;
}

/**
 * After async reconcile/hydrate, pin only if the live viewport is still at the tail
 * and open-scroll intent was not explicitly released (`atBottom: false`).
 */
export function shouldPinAfterAsyncReconcile(params: {
  reconcileWantsPin: boolean;
  liveNearBottom: boolean;
  openScrollAtBottom?: boolean | null;
}): boolean {
  if (!params.reconcileWantsPin || !params.liveNearBottom) return false;
  if (params.openScrollAtBottom === false) return false;
  return true;
}
