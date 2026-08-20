export const SKIP_CARET_FOLLOW_SCROLL_ATTR = 'data-skip-caret-follow-scroll';

/** Covers the 250ms keyboard-dialog CSS shift plus delayed Android selection events. */
export const LAYOUT_JITTER_WINDOW_MS = 400;

export type TextSelection = {
  start: number;
  end: number;
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

export function shouldRestoreSelection(
  current: TextSelection,
  intended: TextSelection,
): boolean {
  return current.start !== intended.start || current.end !== intended.end;
}

export function isSpuriousStartJump(
  incoming: TextSelection,
  previous: TextSelection,
): boolean {
  const incomingCollapsedAtStart = incoming.start === 0 && incoming.end === 0;
  const previousNotAtStart = previous.start > 0 || previous.end > 0;
  return incomingCollapsedAtStart && previousNotAtStart;
}

export function shouldAdoptIncomingSelection(opts: {
  incoming: TextSelection;
  previous: TextSelection;
  valueChanged: boolean;
  msSinceLayoutJitter: number;
  layoutJitterWindowMs?: number;
}): boolean {
  if (opts.valueChanged) return true;
  const windowMs = opts.layoutJitterWindowMs ?? LAYOUT_JITTER_WINDOW_MS;
  if (
    opts.msSinceLayoutJitter <= windowMs &&
    isSpuriousStartJump(opts.incoming, opts.previous)
  ) {
    return false;
  }
  return true;
}

export function nextPreservedSelection(opts: {
  incoming: TextSelection;
  previous: TextSelection;
  valueChanged: boolean;
  msSinceLayoutJitter: number;
  layoutJitterWindowMs?: number;
}): TextSelection {
  return shouldAdoptIncomingSelection(opts) ? opts.incoming : opts.previous;
}

export function applyTextSelection(
  el: Pick<HTMLTextAreaElement, 'value' | 'setSelectionRange'>,
  selection: TextSelection,
): TextSelection {
  const next = clampSelection(selection, el.value.length);
  el.setSelectionRange(next.start, next.end);
  return next;
}

export function shouldSkipCaretFollowScroll(el: HTMLElement | null): boolean {
  return !!el?.hasAttribute(SKIP_CARET_FOLLOW_SCROLL_ATTR);
}
