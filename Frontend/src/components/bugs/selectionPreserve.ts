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

export type AdoptSelectionOpts = {
  incoming: TextSelection;
  previous: TextSelection;
  valueChanged: boolean;
  msSinceLayoutJitter: number;
  msSinceValueCommit?: number;
  userSelecting?: boolean;
  platform?: SelectionPlatform;
  previousValueLength?: number;
  nextValueLength?: number;
  layoutJitterWindowMs?: number;
  valueCommitWindowMs?: number;
};

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

export function isCollapsedAtStart(selection: TextSelection): boolean {
  return selection.start === 0 && selection.end === 0;
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
  if (opts?.userSelecting) {
    return isSpuriousStartJump(current, intended, { userSelecting: true });
  }
  return true;
}

export function isSpuriousStartJump(
  incoming: TextSelection,
  previous: TextSelection,
  opts?: { userSelecting?: boolean },
): boolean {
  if (!isCollapsedAtStart(incoming)) return false;
  if (isCollapsedAtStart(previous)) return false;
  if (previous.start === previous.end && previous.start === 1 && opts?.userSelecting) {
    return false;
  }
  return true;
}

export function isInSelectionProtectionWindow(opts: {
  msSinceLayoutJitter: number;
  msSinceValueCommit?: number;
  layoutJitterWindowMs?: number;
  valueCommitWindowMs?: number;
}): boolean {
  const layoutWindow = opts.layoutJitterWindowMs ?? LAYOUT_JITTER_WINDOW_MS;
  const valueWindow = opts.valueCommitWindowMs ?? VALUE_COMMIT_WINDOW_MS;
  return (
    opts.msSinceLayoutJitter <= layoutWindow ||
    (opts.msSinceValueCommit ?? Number.POSITIVE_INFINITY) <= valueWindow
  );
}

export function isSelectionRestoreLoopActive(opts: {
  now: number;
  layoutJitterAt: number;
  valueCommitAt: number;
  layoutJitterWindowMs?: number;
  valueCommitWindowMs?: number;
}): boolean {
  return isInSelectionProtectionWindow({
    msSinceLayoutJitter: opts.now - opts.layoutJitterAt,
    msSinceValueCommit: opts.now - opts.valueCommitAt,
    layoutJitterWindowMs: opts.layoutJitterWindowMs,
    valueCommitWindowMs: opts.valueCommitWindowMs,
  });
}

export function caretAfterSpuriousStartJumpOnValueChange(
  previous: TextSelection,
  previousValueLength: number,
  nextValueLength: number,
): TextSelection {
  const newLen = Math.max(0, nextValueLength);
  if (previous.start !== previous.end) {
    return clampSelection({ start: previous.start, end: previous.start }, newLen);
  }
  const delta = nextValueLength - previousValueLength;
  const caret = Math.min(Math.max(0, previous.start + delta), newLen);
  return { start: caret, end: caret };
}

export function selectionAfterValueChange(opts: {
  incoming: TextSelection;
  previous: TextSelection;
  previousValueLength: number;
  nextValueLength: number;
}): TextSelection {
  if (!isCollapsedAtStart(opts.incoming)) return opts.incoming;

  if (isCollapsedAtStart(opts.previous) && opts.nextValueLength > opts.previousValueLength) {
    const inserted = opts.nextValueLength - opts.previousValueLength;
    return { start: inserted, end: inserted };
  }

  if (isSpuriousStartJump(opts.incoming, opts.previous)) {
    return caretAfterSpuriousStartJumpOnValueChange(
      opts.previous,
      opts.previousValueLength,
      opts.nextValueLength,
    );
  }

  return opts.incoming;
}

export function shouldAdoptIncomingSelection(opts: AdoptSelectionOpts): boolean {
  if (opts.valueChanged) return true;
  if (
    isInSelectionProtectionWindow(opts) &&
    isSpuriousStartJump(opts.incoming, opts.previous, { userSelecting: opts.userSelecting })
  ) {
    if (opts.userSelecting && opts.platform === 'ios') return true;
    return false;
  }
  return true;
}

export function nextPreservedSelection(opts: AdoptSelectionOpts): TextSelection {
  if (
    opts.valueChanged &&
    opts.previousValueLength != null &&
    opts.nextValueLength != null
  ) {
    return selectionAfterValueChange({
      incoming: opts.incoming,
      previous: opts.previous,
      previousValueLength: opts.previousValueLength,
      nextValueLength: opts.nextValueLength,
    });
  }
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
