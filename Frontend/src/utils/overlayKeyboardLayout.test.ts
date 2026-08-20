// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  computeOverlayVisibleFrame,
  computePinnedOverlayMaxHeightPx,
  computeVisualViewportCssVarWrites,
  createFrameCoalescer,
  isOverlayChromeInVisualViewport,
  overlaySafeTopOverlapPx,
  overlaySheetTopPx,
  pickChangedCssVars,
  VISUAL_VIEWPORT_CSS_VAR,
} from './overlayKeyboardLayout';

const PHONE_INNER = 844;
const KEYBOARD = 336;
const TALL_SHEET = Math.round(PHONE_INNER * 0.94);

describe('computeOverlayVisibleFrame', () => {
  it('matches visualViewport when offsetTop is 0', () => {
    const frame = computeOverlayVisibleFrame({
      innerHeight: PHONE_INNER,
      vvHeight: PHONE_INNER - KEYBOARD,
      vvOffsetTop: 0,
      keyboardInsetPx: KEYBOARD,
    });
    expect(frame).toEqual({
      offsetTopPx: 0,
      heightPx: PHONE_INNER - KEYBOARD,
      bottomInsetPx: KEYBOARD,
    });
  });

  it('compensates iOS visualViewport offset so the frame sits in the visible area', () => {
    const offsetTop = 200;
    const vvHeight = 508;
    const inset = PHONE_INNER - vvHeight - offsetTop;
    const frame = computeOverlayVisibleFrame({
      innerHeight: PHONE_INNER,
      vvHeight,
      vvOffsetTop: offsetTop,
      keyboardInsetPx: inset,
    });
    expect(frame).toEqual({
      offsetTopPx: offsetTop,
      heightPx: vvHeight,
      bottomInsetPx: inset,
    });
    expect(frame.offsetTopPx + frame.heightPx + frame.bottomInsetPx).toBe(PHONE_INNER);
  });

  it('uses derived bottom inset when plugin inset under-reports', () => {
    const frame = computeOverlayVisibleFrame({
      innerHeight: PHONE_INNER,
      vvHeight: 500,
      vvOffsetTop: 40,
      keyboardInsetPx: 10,
    });
    expect(frame.bottomInsetPx).toBe(PHONE_INNER - 500 - 40);
    expect(frame.heightPx).toBe(500);
  });
});

describe('pinned overlay max height', () => {
  it('does not subtract safe-area twice when offsetTop already cleared it', () => {
    const frame = computeOverlayVisibleFrame({
      innerHeight: PHONE_INNER,
      vvHeight: 508,
      vvOffsetTop: 200,
      keyboardInsetPx: 136,
    });
    expect(overlaySafeTopOverlapPx(200, 47)).toBe(0);
    expect(computePinnedOverlayMaxHeightPx(frame, { safeTopPx: 47 })).toBe(508);
  });

  it('keeps safe-area when visual viewport starts at layout top', () => {
    const frame = computeOverlayVisibleFrame({
      innerHeight: PHONE_INNER,
      vvHeight: PHONE_INNER - KEYBOARD,
      vvOffsetTop: 0,
      keyboardInsetPx: KEYBOARD,
    });
    expect(computePinnedOverlayMaxHeightPx(frame, { safeTopPx: 47 })).toBe(
      PHONE_INNER - KEYBOARD - 47,
    );
  });
});

describe('sheet chrome vs visual viewport', () => {
  it('unclamped 94dvh sheet + keyboard bottom inset sends chrome above the visual viewport', () => {
    const offsetTop = 200;
    const vvHeight = 508;
    const inset = PHONE_INNER - vvHeight - offsetTop;
    const frame = computeOverlayVisibleFrame({
      innerHeight: PHONE_INNER,
      vvHeight,
      vvOffsetTop: offsetTop,
      keyboardInsetPx: inset,
    });
    const oldMaxHeight = PHONE_INNER - inset - 24;
    const oldTop = overlaySheetTopPx(PHONE_INNER, Math.min(TALL_SHEET, oldMaxHeight), inset);
    expect(isOverlayChromeInVisualViewport({ chromeTopPx: oldTop, frame })).toBe(false);
  });

  it('clamping sheet height to the visible frame keeps chrome on-screen', () => {
    const offsetTop = 200;
    const vvHeight = 508;
    const inset = PHONE_INNER - vvHeight - offsetTop;
    const frame = computeOverlayVisibleFrame({
      innerHeight: PHONE_INNER,
      vvHeight,
      vvOffsetTop: offsetTop,
      keyboardInsetPx: inset,
    });
    const maxHeight = computePinnedOverlayMaxHeightPx(frame, { safeTopPx: 47 });
    const usedHeight = Math.min(TALL_SHEET, maxHeight);
    const top = overlaySheetTopPx(PHONE_INNER, usedHeight, inset);
    expect(top).toBe(frame.offsetTopPx);
    expect(isOverlayChromeInVisualViewport({ chromeTopPx: top, frame })).toBe(true);
  });

  it('clamping to vv height keeps chrome in the visual viewport when offsetTop is 0', () => {
    const inset = KEYBOARD;
    const frame = computeOverlayVisibleFrame({
      innerHeight: PHONE_INNER,
      vvHeight: PHONE_INNER - inset,
      vvOffsetTop: 0,
      keyboardInsetPx: inset,
    });
    const translatedTop = overlaySheetTopPx(PHONE_INNER, TALL_SHEET, inset);
    const clampedTop = overlaySheetTopPx(
      PHONE_INNER,
      Math.min(TALL_SHEET, frame.heightPx),
      inset,
    );
    expect(isOverlayChromeInVisualViewport({ chromeTopPx: translatedTop, frame })).toBe(false);
    expect(isOverlayChromeInVisualViewport({ chromeTopPx: clampedTop, frame })).toBe(true);
  });

  it('plugin inset larger than derived + offsetTop still keeps chrome in the visual viewport', () => {
    const offsetTop = 200;
    const vvHeight = 508;
    const derivedBottom = PHONE_INNER - vvHeight - offsetTop;
    expect(KEYBOARD).toBeGreaterThan(derivedBottom);
    const visualViewport = {
      offsetTopPx: offsetTop,
      heightPx: vvHeight,
      bottomInsetPx: derivedBottom,
    };
    const frame = computeOverlayVisibleFrame({
      innerHeight: PHONE_INNER,
      vvHeight,
      vvOffsetTop: offsetTop,
      keyboardInsetPx: KEYBOARD,
    });
    expect(frame.heightPx).toBe(PHONE_INNER - KEYBOARD - offsetTop);
    expect(frame.heightPx).toBeLessThan(vvHeight);

    const vvOnlyTop = overlaySheetTopPx(PHONE_INNER, Math.min(TALL_SHEET, vvHeight), KEYBOARD);
    expect(isOverlayChromeInVisualViewport({ chromeTopPx: vvOnlyTop, frame: visualViewport })).toBe(
      false,
    );

    const maxHeight = computePinnedOverlayMaxHeightPx(frame, { safeTopPx: 47 });
    const top = overlaySheetTopPx(PHONE_INNER, Math.min(TALL_SHEET, maxHeight), frame.bottomInsetPx);
    expect(top).toBe(offsetTop);
    expect(isOverlayChromeInVisualViewport({ chromeTopPx: top, frame: visualViewport })).toBe(true);
  });
});

describe('CSS overlay vars match overlayKeyboardLayout', () => {
  const cssOverlayBox = (opts: {
    layoutInnerHeightPx: number;
    vvHeightPx: number;
    vvOffsetTopPx: number;
    keyboardHeightPx: number;
    safeTopPx: number;
  }) => {
    const derivedBottom = Math.max(
      0,
      opts.layoutInnerHeightPx - opts.vvHeightPx - opts.vvOffsetTopPx,
    );
    const bottomInset = Math.max(opts.keyboardHeightPx, derivedBottom);
    const frameHeight = Math.min(
      opts.vvHeightPx,
      opts.layoutInnerHeightPx - bottomInset - opts.vvOffsetTopPx,
    );
    const safeOverlap = Math.max(0, opts.safeTopPx - opts.vvOffsetTopPx);
    return {
      bottomInset,
      frameHeight,
      pinnedMaxHeight: Math.max(0, frameHeight - safeOverlap),
    };
  };

  it('matches computeOverlayVisibleFrame when plugin over-reports and offsetTop is non-zero', () => {
    const css = cssOverlayBox({
      layoutInnerHeightPx: PHONE_INNER,
      vvHeightPx: 508,
      vvOffsetTopPx: 200,
      keyboardHeightPx: KEYBOARD,
      safeTopPx: 47,
    });
    const frame = computeOverlayVisibleFrame({
      innerHeight: PHONE_INNER,
      vvHeight: 508,
      vvOffsetTop: 200,
      keyboardInsetPx: KEYBOARD,
    });
    expect(css.bottomInset).toBe(frame.bottomInsetPx);
    expect(css.frameHeight).toBe(frame.heightPx);
    expect(css.pinnedMaxHeight).toBe(computePinnedOverlayMaxHeightPx(frame, { safeTopPx: 47 }));
  });

  it('declares --overlay-frame-height as min(vv, layout − inset − offsetTop)', () => {
    const variables = readFileSync(
      new URL('../styles/keyboard/variables.css', import.meta.url),
      'utf8',
    );
    const chrome = readFileSync(
      new URL('../styles/keyboard/overlay-chrome.css', import.meta.url),
      'utf8',
    );
    expect(variables).toContain('body.keyboard-visible');
    expect(variables).toContain('--overlay-pinned-max-height: 100dvh');
    const restingVars = variables.split('body.keyboard-visible')[0];
    expect(restingVars).toContain('--overlay-pinned-max-height: 100dvh');
    expect(restingVars).not.toContain('--overlay-frame-height');
    expect(restingVars).not.toContain('--vv-offset-top)');
    expect(variables).toContain('--overlay-frame-height: min(');
    expect(variables).toContain(
      'calc(var(--layout-inner-height) - var(--overlay-bottom-inset) - var(--vv-offset-top))',
    );
    expect(chrome).toContain('max-height: var(--overlay-pinned-max-height');
    expect(chrome).toContain('bottom: var(--overlay-bottom-inset');
    expect(chrome).toContain('.overlay-keyboard-body:has([data-overlay-scrollport])');
    expect(chrome).toContain('transition: bottom 0.25s');
    expect(chrome).not.toContain('max-height 0.25s');
    expect(chrome).not.toContain('transform: none');
  });
});

describe('visualViewport CSS var writes', () => {
  it('rounds layout and visualViewport metrics to CSS pixels', () => {
    expect(
      computeVisualViewportCssVarWrites({
        innerHeight: 843.6,
        vvHeight: 507.4,
        vvOffsetTop: 199.6,
      }),
    ).toEqual([
      [VISUAL_VIEWPORT_CSS_VAR.layoutInnerHeight, '844px'],
      [VISUAL_VIEWPORT_CSS_VAR.vvHeight, '507px'],
      [VISUAL_VIEWPORT_CSS_VAR.vvOffsetTop, '200px'],
    ]);
  });

  it('omits visualViewport vars when the API is missing', () => {
    expect(
      computeVisualViewportCssVarWrites({
        innerHeight: 844,
        vvHeight: null,
        vvOffsetTop: null,
      }),
    ).toEqual([[VISUAL_VIEWPORT_CSS_VAR.layoutInnerHeight, '844px']]);
  });

  it('skips writes when rounded values are unchanged', () => {
    const last = new Map([
      [VISUAL_VIEWPORT_CSS_VAR.vvHeight, '508px'],
      [VISUAL_VIEWPORT_CSS_VAR.vvOffsetTop, '200px'],
    ]);
    const next = computeVisualViewportCssVarWrites({
      innerHeight: 0,
      vvHeight: 508.2,
      vvOffsetTop: 199.6,
    });
    expect(pickChangedCssVars(last, next)).toEqual([]);
  });

  it('coalesces multiple visualViewport events to one frame', () => {
    const queued: FrameRequestCallback[] = [];
    let runs = 0;
    const coalescer = createFrameCoalescer(
      () => {
        runs += 1;
      },
      (cb) => {
        queued.push(cb);
        return queued.length;
      },
      () => {
        queued.length = 0;
      },
    );
    coalescer.schedule();
    coalescer.schedule();
    coalescer.schedule();
    expect(queued).toHaveLength(1);
    queued[0](0);
    expect(runs).toBe(1);
    coalescer.schedule();
    expect(queued).toHaveLength(2);
  });
});
