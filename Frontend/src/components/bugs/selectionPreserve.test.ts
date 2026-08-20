// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  LAYOUT_JITTER_WINDOW_MS,
  SKIP_CARET_FOLLOW_SCROLL_ATTR,
  VALUE_COMMIT_WINDOW_MS,
  applyTextSelection,
  clampSelection,
  isSelectionRestoreLoopActive,
  isSpuriousStartJump,
  nextPreservedSelection,
  readTextSelection,
  selectionAfterValueChange,
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

  it('on iOS restores only a snap to the start', () => {
    expect(
      shouldRestoreSelection({ start: 0, end: 0 }, { start: 7, end: 7 }, { platform: 'ios' }),
    ).toBe(true);
    expect(
      shouldRestoreSelection({ start: 6, end: 6 }, { start: 2, end: 2 }, { platform: 'ios' }),
    ).toBe(false);
  });

  it('on iOS does not restore while the user is selecting', () => {
    expect(
      shouldRestoreSelection(
        { start: 0, end: 0 },
        { start: 7, end: 7 },
        { platform: 'ios', userSelecting: true },
      ),
    ).toBe(false);
  });

  it('on Android restores a start snap during a drag, but does not fight other moves', () => {
    expect(
      shouldRestoreSelection(
        { start: 0, end: 0 },
        { start: 7, end: 7 },
        { platform: 'other', userSelecting: true },
      ),
    ).toBe(true);
    expect(
      shouldRestoreSelection(
        { start: 8, end: 8 },
        { start: 3, end: 3 },
        { platform: 'other', userSelecting: true },
      ),
    ).toBe(false);
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

  it('treats a 1-to-0 reset after typing as a snap', () => {
    expect(isSpuriousStartJump({ start: 0, end: 0 }, { start: 1, end: 1 })).toBe(true);
  });

  it('does not treat a one-character drag to the start as a snap', () => {
    expect(
      isSpuriousStartJump({ start: 0, end: 0 }, { start: 1, end: 1 }, { userSelecting: true }),
    ).toBe(false);
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

  it('rejects an Android start snap while the user is dragging right', () => {
    expect(
      shouldAdoptIncomingSelection({
        incoming: { start: 0, end: 0 },
        previous: { start: 11, end: 11 },
        valueChanged: false,
        msSinceLayoutJitter: 16,
        userSelecting: true,
        platform: 'other',
      }),
    ).toBe(false);
  });

  it('adopts an iOS drag to the start during jitter', () => {
    expect(
      shouldAdoptIncomingSelection({
        incoming: { start: 0, end: 0 },
        previous: { start: 11, end: 11 },
        valueChanged: false,
        msSinceLayoutJitter: 16,
        userSelecting: true,
        platform: 'ios',
      }),
    ).toBe(true);
  });

  it('rejects a jump to the start shortly after a value commit', () => {
    expect(
      shouldAdoptIncomingSelection({
        incoming: { start: 0, end: 0 },
        previous: { start: 12, end: 12 },
        valueChanged: false,
        msSinceLayoutJitter: 10_000,
        msSinceValueCommit: 16,
      }),
    ).toBe(false);
  });

  it('adopts a jump to the start after the value-commit window', () => {
    expect(
      shouldAdoptIncomingSelection({
        incoming: { start: 0, end: 0 },
        previous: { start: 12, end: 12 },
        valueChanged: false,
        msSinceLayoutJitter: 10_000,
        msSinceValueCommit: VALUE_COMMIT_WINDOW_MS + 1,
      }),
    ).toBe(true);
  });
});

describe('selectionAfterValueChange', () => {
  it('keeps a native caret after typing at the end', () => {
    expect(
      selectionAfterValueChange({
        incoming: { start: 12, end: 12 },
        previous: { start: 11, end: 11 },
        previousValueLength: 11,
        nextValueLength: 12,
      }),
    ).toEqual({ start: 12, end: 12 });
  });

  it('reconstructs the end caret when Android reports 0 after typing at the end', () => {
    expect(
      selectionAfterValueChange({
        incoming: { start: 0, end: 0 },
        previous: { start: 11, end: 11 },
        previousValueLength: 11,
        nextValueLength: 12,
      }),
    ).toEqual({ start: 12, end: 12 });
  });

  it('places the caret after the first character when Android reports 0', () => {
    expect(
      selectionAfterValueChange({
        incoming: { start: 0, end: 0 },
        previous: { start: 0, end: 0 },
        previousValueLength: 0,
        nextValueLength: 1,
      }),
    ).toEqual({ start: 1, end: 1 });
  });

  it('collapses a replaced range to its start', () => {
    expect(
      selectionAfterValueChange({
        incoming: { start: 0, end: 0 },
        previous: { start: 3, end: 8 },
        previousValueLength: 12,
        nextValueLength: 8,
      }),
    ).toEqual({ start: 3, end: 3 });
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
        previousValueLength: 11,
        nextValueLength: 12,
        msSinceLayoutJitter: 0,
      }),
    ).toEqual({ start: 12, end: 12 });
  });

  it('keeps typing at the end when the commit event already jumped to 0', () => {
    expect(
      nextPreservedSelection({
        incoming: { start: 0, end: 0 },
        previous: { start: 11, end: 11 },
        valueChanged: true,
        previousValueLength: 11,
        nextValueLength: 12,
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

  it('keeps the caret when Android snaps to start during a right-drag', () => {
    expect(
      nextPreservedSelection({
        incoming: { start: 0, end: 0 },
        previous: { start: 8, end: 8 },
        valueChanged: false,
        msSinceLayoutJitter: 10,
        userSelecting: true,
        platform: 'other',
      }),
    ).toEqual({ start: 8, end: 8 });
  });

  it('adopts the last step of a drag to the start during jitter', () => {
    expect(
      nextPreservedSelection({
        incoming: { start: 0, end: 0 },
        previous: { start: 1, end: 1 },
        valueChanged: false,
        msSinceLayoutJitter: 10,
        userSelecting: true,
      }),
    ).toEqual({ start: 0, end: 0 });
  });

  it('keeps the caret after the first character when Android snaps to 0', () => {
    expect(
      nextPreservedSelection({
        incoming: { start: 0, end: 0 },
        previous: { start: 1, end: 1 },
        valueChanged: false,
        msSinceLayoutJitter: 10_000,
        msSinceValueCommit: 16,
      }),
    ).toEqual({ start: 1, end: 1 });
  });

  it('keeps the typed caret when Android resets after a controlled commit', () => {
    const incoming = { start: 0, end: 0 };
    const previous = { start: 12, end: 12 };
    const next = nextPreservedSelection({
      incoming,
      previous,
      valueChanged: false,
      msSinceLayoutJitter: 10_000,
      msSinceValueCommit: 16,
    });
    expect(next).toEqual(previous);
    expect(shouldRestoreSelection(incoming, next)).toBe(true);
  });
});

describe('isSelectionRestoreLoopActive', () => {
  it('stays active through layout jitter and the value-commit window', () => {
    expect(
      isSelectionRestoreLoopActive({
        now: 200,
        layoutJitterAt: 0,
        valueCommitAt: Number.NEGATIVE_INFINITY,
      }),
    ).toBe(true);
    expect(
      isSelectionRestoreLoopActive({
        now: 80,
        layoutJitterAt: Number.NEGATIVE_INFINITY,
        valueCommitAt: 0,
      }),
    ).toBe(true);
    expect(
      isSelectionRestoreLoopActive({
        now: LAYOUT_JITTER_WINDOW_MS + 1,
        layoutJitterAt: 0,
        valueCommitAt: Number.NEGATIVE_INFINITY,
      }),
    ).toBe(false);
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

  it('clears horizontal scroll after applying selection', () => {
    const setSelectionRange = vi.fn();
    const el = { value: 'hello', setSelectionRange, scrollLeft: 40 };
    applyTextSelection(el, { start: 2, end: 2 });
    expect(el.scrollLeft).toBe(0);
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

describe('VALUE_COMMIT_WINDOW_MS', () => {
  it('is shorter than layout jitter so tap-to-start after typing is not swallowed', () => {
    expect(VALUE_COMMIT_WINDOW_MS).toBeGreaterThan(0);
    expect(VALUE_COMMIT_WINDOW_MS).toBeLessThan(LAYOUT_JITTER_WINDOW_MS);
  });
});
