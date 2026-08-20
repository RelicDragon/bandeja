export const SKIP_CARET_FOLLOW_SCROLL_ATTR = 'data-skip-caret-follow-scroll';

/** Covers the 250ms keyboard-dialog CSS shift plus delayed Android selection events. */
export const LAYOUT_JITTER_WINDOW_MS = 400;

/** Android WebView often resets selection after a controlled value commit, after layout. */
export const VALUE_COMMIT_WINDOW_MS = 150;

export type TextSelection = {
  start: number;
  end: number;
};

export type SelectionPlatform = 'ios' | 'other';

export function clampSelection(selection: TextSelection, valueLength: number): TextSelection {
  const length = Math.max(0, valueLength);
  const start = Math.min(Math.max(0, selection.start), length);
  const end = Math.min(Math.max(0, selection.end), length);
  if (start <= end) return { start, end };
  return { start: end, end: start };
}

export function readTextSelection(el: {
  selectionStart: number | null;
  selectionEnd: number | null;
}): TextSelection | null {
  if (el.selectionStart == null || el.selectionEnd == null) return null;
  return { start: el.selectionStart, end: el.selectionEnd };
}

export function shouldRestoreSelection(
  current: TextSelection,
  intended: TextSelection,
  opts?: { platform?: SelectionPlatform; userSelecting?: boolean },
): boolean {
  if (current.start === intended.start && current.end === intended.end) return false;
  if (opts?.platform === 'ios') {
    if (opts.userSelecting) return false;
    return isSpuriousStartJump(current, intended);
  }
  return true;
}

export function isSpuriousStartJump(
  incoming: TextSelection,
  previous: TextSelection,
): boolean {
  const incomingCollapsedAtStart = incoming.start === 0 && incoming.end === 0;
  if (!incomingCollapsedAtStart) return false;
  if (previous.start === 0 && previous.end === 0) return false;
  // One-character drag to the start is user intent, not a WebView snap.
  if (previous.start === previous.end && previous.start === 1) return false;
  return true;
}

export function shouldAdoptIncomingSelection(opts: {
  incoming: TextSelection;
  previous: TextSelection;
  valueChanged: boolean;
  msSinceLayoutJitter: number;
  msSinceValueCommit?: number;
  userSelecting?: boolean;
  layoutJitterWindowMs?: number;
  valueCommitWindowMs?: number;
}): boolean {
  if (opts.valueChanged) return true;
  if (opts.userSelecting) return true;
  const layoutWindow = opts.layoutJitterWindowMs ?? LAYOUT_JITTER_WINDOW_MS;
  const valueWindow = opts.valueCommitWindowMs ?? VALUE_COMMIT_WINDOW_MS;
  const inLayoutJitter = opts.msSinceLayoutJitter <= layoutWindow;
  const inValueCommit = (opts.msSinceValueCommit ?? Number.POSITIVE_INFINITY) <= valueWindow;
  if ((inLayoutJitter || inValueCommit) && isSpuriousStartJump(opts.incoming, opts.previous)) {
    return false;
  }
  return true;
}

export function nextPreservedSelection(opts: {
  incoming: TextSelection;
  previous: TextSelection;
  valueChanged: boolean;
  msSinceLayoutJitter: number;
  msSinceValueCommit?: number;
  userSelecting?: boolean;
  layoutJitterWindowMs?: number;
  valueCommitWindowMs?: number;
}): TextSelection {
  return shouldAdoptIncomingSelection(opts) ? opts.incoming : opts.previous;
}

export function applyTextSelection(
  el: Pick<HTMLTextAreaElement, 'value' | 'setSelectionRange'> & { scrollLeft?: number },
  selection: TextSelection,
): TextSelection {
  const next = clampSelection(selection, el.value.length);
  el.setSelectionRange(next.start, next.end);
  if (typeof el.scrollLeft === 'number') el.scrollLeft = 0;
  return next;
}

export function shouldSkipCaretFollowScroll(el: HTMLElement | null): boolean {
  return !!el?.hasAttribute(SKIP_CARET_FOLLOW_SCROLL_ATTR);
}
