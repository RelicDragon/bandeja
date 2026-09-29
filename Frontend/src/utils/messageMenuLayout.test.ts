import { describe, expect, it } from 'vitest';
import { computeMessageMenuTop } from './messageMenuUtils';
import {
  computeMessageMenuLayout,
  resolveMessageMenuAnchorAlign,
  type MessageMenuLayoutInput,
  type MessageMenuRect,
} from './messageMenuLayout';

describe('computeMessageMenuTop', () => {
  it('centers the menu vertically when there is room', () => {
    expect(computeMessageMenuTop(800, 200)).toBe(300);
  });

  it('clamps to top padding when the menu is taller than the viewport', () => {
    expect(computeMessageMenuTop(400, 500)).toBe(20);
  });

  it('keeps centered position when the menu fits with margin', () => {
    expect(computeMessageMenuTop(500, 200)).toBe(150);
  });
});

const rect = (left: number, width: number, top = 300, height = 100): MessageMenuRect => ({
  top,
  left,
  width,
  height,
});

// Viewport 400x800, no insets, pad 12, gap 8 → T = 12, B = 788.
const baseInput = (overrides: Partial<MessageMenuLayoutInput> = {}): MessageMenuLayoutInput => ({
  viewportWidth: 400,
  viewportHeight: 800,
  safeTop: 0,
  safeBottom: 0,
  sourceRect: rect(0, 400, 300, 100),
  anchorRect: rect(150, 200, 300, 100),
  anchorAlign: 'end',
  previewNaturalHeight: 100,
  menuHeight: 200,
  menuWidth: 180,
  ...overrides,
});

describe('computeMessageMenuLayout', () => {
  it('keeps the message in place when it and the menu fit', () => {
    const layout = computeMessageMenuLayout(baseInput());
    expect(layout.previewTop).toBe(300);
    expect(layout.previewHeight).toBe(100);
    expect(layout.previewClipped).toBe(false);
    expect(layout.menuTop).toBe(408);
    expect(layout.menuMaxHeight).toBe(672);
  });

  it('pushes a message near the bottom up so the menu fits', () => {
    const layout = computeMessageMenuLayout(baseInput({ sourceRect: rect(0, 400, 650, 100) }));
    expect(layout.previewTop).toBe(480);
    expect(layout.menuTop).toBe(588);
    expect(layout.menuTop + 200).toBe(788);
  });

  it('clamps a message near the top to safeTop + pad', () => {
    const layout = computeMessageMenuLayout(baseInput({ sourceRect: rect(0, 400, 0, 100) }));
    expect(layout.previewTop).toBe(12);
    expect(layout.menuTop).toBe(120);
  });

  it('treats non-finite source top as 0', () => {
    const layout = computeMessageMenuLayout(baseInput({ sourceRect: rect(0, 400, Number.NaN, 100) }));
    expect(layout.previewTop).toBe(12);
  });

  it('clips a very tall message to the available height', () => {
    const layout = computeMessageMenuLayout(
      baseInput({ sourceRect: rect(0, 400, -200, 1000), previewNaturalHeight: 1000 })
    );
    // available = 788 - 12 - 8 - 200 = 568
    expect(layout.previewHeight).toBe(568);
    expect(layout.previewClipped).toBe(true);
    expect(layout.previewTop).toBe(12);
    expect(layout.menuTop).toBe(588);
  });

  it('limits a huge menu with menuMaxHeight while preview keeps minPreviewHeight', () => {
    const layout = computeMessageMenuLayout(baseInput({ menuHeight: 2000 }));
    // minPrev = min(100, 96) = 96 → menuMax = 776 - 8 - 96 = 672
    expect(layout.menuMaxHeight).toBe(672);
    expect(layout.previewHeight).toBe(96);
    expect(layout.previewClipped).toBe(true);
    expect(layout.previewTop).toBe(12);
    expect(layout.menuTop).toBe(116);
  });

  it('does not clip a short message when the menu is huge', () => {
    const layout = computeMessageMenuLayout(baseInput({ menuHeight: 2000, previewNaturalHeight: 50 }));
    expect(layout.menuMaxHeight).toBe(718);
    expect(layout.previewHeight).toBe(50);
    expect(layout.previewClipped).toBe(false);
    expect(layout.previewTop).toBe(12);
    expect(layout.menuTop).toBe(70);
  });

  it('aligns the menu to the bubble end edge', () => {
    const layout = computeMessageMenuLayout(baseInput({ anchorAlign: 'end' }));
    expect(layout.menuLeft).toBe(170);
    expect(layout.menuOriginX).toBe('right');
  });

  it('aligns the menu to the bubble start edge', () => {
    const layout = computeMessageMenuLayout(baseInput({ anchorAlign: 'start' }));
    expect(layout.menuLeft).toBe(150);
    expect(layout.menuOriginX).toBe('left');
  });

  it('centers the menu under the bubble', () => {
    const layout = computeMessageMenuLayout(baseInput({ anchorAlign: 'center' }));
    expect(layout.menuLeft).toBe(160);
    expect(layout.menuOriginX).toBe('center');
  });

  it('clamps the menu inside the viewport horizontally', () => {
    expect(
      computeMessageMenuLayout(baseInput({ anchorAlign: 'end', anchorRect: rect(300, 100) })).menuLeft
    ).toBe(208);
    expect(
      computeMessageMenuLayout(baseInput({ anchorAlign: 'start', anchorRect: rect(300, 100) })).menuLeft
    ).toBe(208);
    expect(
      computeMessageMenuLayout(baseInput({ anchorAlign: 'start', anchorRect: rect(0, 100) })).menuLeft
    ).toBe(12);
    expect(
      computeMessageMenuLayout(baseInput({ anchorAlign: 'center', anchorRect: rect(0, 40) })).menuLeft
    ).toBe(12);
  });

  it('pins a menu wider than the padded viewport to the left padding', () => {
    const layout = computeMessageMenuLayout(baseInput({ menuWidth: 390 }));
    expect(layout.menuLeft).toBe(12);
  });

  it('respects safe-area insets', () => {
    // T = 50 + 12 = 62, B = 800 - 34 - 12 = 754
    const nearTop = computeMessageMenuLayout(
      baseInput({ safeTop: 50, safeBottom: 34, sourceRect: rect(0, 400, 20, 100) })
    );
    expect(nearTop.previewTop).toBe(62);
    expect(nearTop.menuTop).toBe(170);

    const nearBottom = computeMessageMenuLayout(
      baseInput({ safeTop: 50, safeBottom: 34, sourceRect: rect(0, 400, 700, 100) })
    );
    expect(nearBottom.previewTop).toBe(446);
    expect(nearBottom.menuTop).toBe(554);
    expect(nearBottom.menuTop + 200).toBe(754);
    // menuMax = 754 - 62 - 8 - 96 = 588
    expect(nearBottom.menuMaxHeight).toBe(588);
  });
});

describe('resolveMessageMenuAnchorAlign', () => {
  const source = rect(0, 400);

  it('returns start for full-width bubbles', () => {
    expect(resolveMessageMenuAnchorAlign(source, rect(20, 380))).toBe('start');
    expect(resolveMessageMenuAnchorAlign(source, rect(40, 360))).toBe('start');
  });

  it('returns end for bubbles right of centre', () => {
    expect(resolveMessageMenuAnchorAlign(source, rect(250, 140))).toBe('end');
  });

  it('returns start for bubbles left of centre', () => {
    expect(resolveMessageMenuAnchorAlign(source, rect(10, 140))).toBe('start');
  });

  it('returns center within the 8px tolerance', () => {
    expect(resolveMessageMenuAnchorAlign(source, rect(125, 150))).toBe('center');
    expect(resolveMessageMenuAnchorAlign(source, rect(133, 150))).toBe('center');
    expect(resolveMessageMenuAnchorAlign(source, rect(117, 150))).toBe('center');
    expect(resolveMessageMenuAnchorAlign(source, rect(134, 150))).toBe('end');
    expect(resolveMessageMenuAnchorAlign(source, rect(116, 150))).toBe('start');
  });
});
