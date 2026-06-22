import { describe, expect, it } from 'vitest';
import {
  inferTailPreloadNearBottomOnOpen,
  isTailHeightPreloadNearBottom,
  readTailHeightPreloadNearBottom,
  shouldRunTailHeightPreload,
  TAIL_HEIGHT_PRELOAD_NEAR_BOTTOM_PX,
} from '../tailHeightPreloadPolicy';

describe('isTailHeightPreloadNearBottom', () => {
  it('is true within threshold of bottom', () => {
    const clientHeight = 400;
    const scrollHeight = 2000;
    const scrollTop = scrollHeight - clientHeight - (TAIL_HEIGHT_PRELOAD_NEAR_BOTTOM_PX - 1);
    expect(isTailHeightPreloadNearBottom(scrollHeight, scrollTop, clientHeight)).toBe(true);
  });

  it('is false when scrolled into history beyond threshold', () => {
    const clientHeight = 400;
    const scrollHeight = 2000;
    const scrollTop = scrollHeight - clientHeight - TAIL_HEIGHT_PRELOAD_NEAR_BOTTOM_PX;
    expect(isTailHeightPreloadNearBottom(scrollHeight, scrollTop, clientHeight)).toBe(false);
  });
});

describe('inferTailPreloadNearBottomOnOpen', () => {
  it('defaults to true while scroll plan is unknown', () => {
    expect(inferTailPreloadNearBottomOnOpen(undefined)).toBe(true);
  });

  it('is true for open-at-bottom', () => {
    expect(inferTailPreloadNearBottomOnOpen({ atBottom: true })).toBe(true);
  });

  it('is false for anchor restore', () => {
    expect(inferTailPreloadNearBottomOnOpen({ anchorMessageId: 'm1' })).toBe(false);
  });
});

describe('readTailHeightPreloadNearBottom', () => {
  it('uses open scroll plan before the list is scrollable', () => {
    expect(readTailHeightPreloadNearBottom(400, 0, 400, { anchorMessageId: 'm1' })).toBe(false);
    expect(readTailHeightPreloadNearBottom(400, 0, 400, { atBottom: true })).toBe(true);
  });

  it('uses DOM position once the list overflows', () => {
    const clientHeight = 400;
    const scrollHeight = 2000;
    const scrollTop = scrollHeight - clientHeight - TAIL_HEIGHT_PRELOAD_NEAR_BOTTOM_PX;
    expect(
      readTailHeightPreloadNearBottom(scrollHeight, scrollTop, clientHeight, { atBottom: true })
    ).toBe(false);
  });
});

describe('shouldRunTailHeightPreload', () => {
  it('runs when near bottom', () => {
    expect(
      shouldRunTailHeightPreload({ nearBottom: true, openAtBottom: false, layoutSettling: false })
    ).toBe(true);
  });

  it('skips when mid-history', () => {
    expect(
      shouldRunTailHeightPreload({ nearBottom: false, openAtBottom: false, layoutSettling: false })
    ).toBe(false);
  });

  it('runs during open-at-bottom settling even if near-bottom flickers', () => {
    expect(
      shouldRunTailHeightPreload({ nearBottom: false, openAtBottom: true, layoutSettling: true })
    ).toBe(true);
  });

  it('skips mid-history open with anchor', () => {
    expect(
      shouldRunTailHeightPreload({ nearBottom: false, openAtBottom: false, layoutSettling: true })
    ).toBe(false);
  });
});
