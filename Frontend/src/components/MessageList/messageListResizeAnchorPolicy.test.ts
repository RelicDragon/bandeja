import { describe, expect, it } from 'vitest';
import { shouldAdjustForMessageRowResize } from './messageListResizeAnchorPolicy';

describe('shouldAdjustForMessageRowResize', () => {
  it('does not fight active user scrolling', () => {
    expect(
      shouldAdjustForMessageRowResize({
        isScrolling: true,
        itemStart: 100,
        scrollOffset: 500,
      })
    ).toBe(false);
  });

  it('anchors an above-viewport resize after scrolling settles', () => {
    expect(
      shouldAdjustForMessageRowResize({
        isScrolling: false,
        itemStart: 100,
        scrollOffset: 500,
      })
    ).toBe(true);
  });

  it('does not adjust for rows at or below the viewport', () => {
    expect(
      shouldAdjustForMessageRowResize({
        isScrolling: false,
        itemStart: 500,
        scrollOffset: 500,
      })
    ).toBe(false);
  });
});
