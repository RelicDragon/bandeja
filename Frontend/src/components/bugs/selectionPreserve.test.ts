// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  LAYOUT_JITTER_WINDOW_MS,
  SKIP_CARET_FOLLOW_SCROLL_ATTR,
  applyTextSelection,
  clampSelection,
  isSpuriousStartJump,
  nextPreservedSelection,
  readTextSelection,
  shouldAdoptIncomingSelection,
  shouldRestoreSelection,
  shouldSkipCaretFollowScroll,
} from './selectionPreserve';

describe('clampSelection', () => {
  it('clamps past the value length', () => {
    expect(clampSelection({ start: 8, end: 12 }, 5)).toEqual({ start: 5, end: 5 });
  });

  it('clamps negative indexes to 0', () => {
    expect(clampSelection({ start: -2, end: 3 }, 4)).toEqual({ start: 0, end: 3 });
  });

  it('normalizes inverted ranges', () => {
    expect(clampSelection({ start: 4, end: 1 }, 10)).toEqual({ start: 1, end: 4 });
  });
});

describe('shouldRestoreSelection', () => {
  it('is true when the caret drifted', () => {
    expect(shouldRestoreSelection({ start: 0, end: 0 }, { start: 7, end: 7 })).toBe(true);
  });

  it('is false when the caret already matches', () => {
    expect(shouldRestoreSelection({ start: 3, end: 5 }, { start: 3, end: 5 })).toBe(false);
  });
});

describe('isSpuriousStartJump', () => {
  it('detects a collapse to the start from a later caret', () => {
    expect(isSpuriousStartJump({ start: 0, end: 0 }, { start: 9, end: 9 })).toBe(true);
  });

  it('does not treat a caret that was already at the start as a jump', () => {
    expect(isSpuriousStartJump({ start: 0, end: 0 }, { start: 0, end: 0 })).toBe(false);
  });

  it('does not treat a non-zero selection as a start jump', () => {
    expect(isSpuriousStartJump({ start: 0, end: 4 }, { start: 9, end: 9 })).toBe(false);
  });
});

describe('shouldAdoptIncomingSelection', () => {
  it('adopts user caret moves', () => {
    expect(
      shouldAdoptIncomingSelection({
        incoming: { start: 6, end: 6 },
        previous: { start: 2, end: 2 },
        valueChanged: false,
        msSinceLayoutJitter: 5_000,
      }),
    ).toBe(true);
  });

  it('rejects a jump to the start during layout jitter', () => {
    expect(
      shouldAdoptIncomingSelection({
        incoming: { start: 0, end: 0 },
        previous: { start: 11, end: 11 },
        valueChanged: false,
        msSinceLayoutJitter: 16,
      }),
    ).toBe(false);
  });

  it('adopts a jump to the start when the value changed', () => {
    expect(
      shouldAdoptIncomingSelection({
        incoming: { start: 0, end: 0 },
        previous: { start: 11, end: 11 },
        valueChanged: true,
        msSinceLayoutJitter: 16,
      }),
    ).toBe(true);
  });

  it('adopts a jump to the start after the jitter window', () => {
    expect(
      shouldAdoptIncomingSelection({
        incoming: { start: 0, end: 0 },
        previous: { start: 11, end: 11 },
        valueChanged: false,
        msSinceLayoutJitter: LAYOUT_JITTER_WINDOW_MS + 1,
      }),
    ).toBe(true);
  });
});

describe('nextPreservedSelection', () => {
  it('keeps the previous caret when Android resets to start mid-reflow', () => {
    expect(
      nextPreservedSelection({
        incoming: { start: 0, end: 0 },
        previous: { start: 14, end: 14 },
        valueChanged: false,
        msSinceLayoutJitter: 40,
      }),
    ).toEqual({ start: 14, end: 14 });
  });

  it('moves with typing at the end', () => {
    expect(
      nextPreservedSelection({
        incoming: { start: 12, end: 12 },
        previous: { start: 11, end: 11 },
        valueChanged: true,
        msSinceLayoutJitter: 0,
      }),
    ).toEqual({ start: 12, end: 12 });
  });

  it('adopts dragging the caret right even during layout jitter', () => {
    expect(
      nextPreservedSelection({
        incoming: { start: 8, end: 8 },
        previous: { start: 3, end: 3 },
        valueChanged: false,
        msSinceLayoutJitter: 10,
      }),
    ).toEqual({ start: 8, end: 8 });
  });
});

describe('readTextSelection / applyTextSelection', () => {
  it('reads null when the element has no selection', () => {
    expect(readTextSelection({ selectionStart: null, selectionEnd: null })).toBe(null);
  });

  it('applies a clamped range', () => {
    const setSelectionRange = vi.fn();
    const next = applyTextSelection(
      { value: 'hello', setSelectionRange },
      { start: 2, end: 99 },
    );
    expect(next).toEqual({ start: 2, end: 5 });
    expect(setSelectionRange).toHaveBeenCalledWith(2, 5);
  });
});

describe('shouldSkipCaretFollowScroll', () => {
  it('is true only when the opt-out attribute is present', () => {
    const withAttr = document.createElement('textarea');
    withAttr.setAttribute(SKIP_CARET_FOLLOW_SCROLL_ATTR, '');
    const plain = document.createElement('textarea');
    expect(shouldSkipCaretFollowScroll(withAttr)).toBe(true);
    expect(shouldSkipCaretFollowScroll(plain)).toBe(false);
    expect(shouldSkipCaretFollowScroll(null)).toBe(false);
  });
});

describe('LAYOUT_JITTER_WINDOW_MS', () => {
  it('covers the keyboard dialog CSS shift', () => {
    expect(LAYOUT_JITTER_WINDOW_MS).toBeGreaterThanOrEqual(250);
  });
});
