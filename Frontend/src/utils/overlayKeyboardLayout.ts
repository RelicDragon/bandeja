/**
 * Overlay frame inside the visual viewport when Keyboard.resize is "none".
 * CSS in `styles/keyboard/overlay-chrome.css` mirrors this math via
 * `--vv-height`, `--vv-offset-top`, and `--keyboard-height`.
 *
 * Do not translate a full-size overlay by the keyboard inset: shrink height
 * to this frame so chrome stays at the visual-viewport top.
 */

export const VISUAL_VIEWPORT_CSS_VAR = {
  layoutInnerHeight: '--layout-inner-height',
  vvHeight: '--vv-height',
  vvOffsetTop: '--vv-offset-top',
} as const;

export type OverlayVisibleFrame = {
  offsetTopPx: number;
  heightPx: number;
  bottomInsetPx: number;
};

export function computeOverlayVisibleFrame(opts: {
  innerHeight: number;
  vvHeight: number | null;
  vvOffsetTop: number | null;
  keyboardInsetPx: number;
}): OverlayVisibleFrame {
  const innerHeight = Math.max(0, Math.round(opts.innerHeight));
  const vvHeight =
    opts.vvHeight != null ? Math.max(0, Math.round(opts.vvHeight)) : innerHeight;
  const vvOffsetTop =
    opts.vvOffsetTop != null ? Math.max(0, Math.round(opts.vvOffsetTop)) : 0;
  const derivedBottom = Math.max(0, innerHeight - vvHeight - vvOffsetTop);
  const bottomInsetPx = Math.max(0, Math.round(opts.keyboardInsetPx), derivedBottom);
  const heightPx = Math.max(0, Math.min(vvHeight, innerHeight - bottomInsetPx - vvOffsetTop));
  return {
    offsetTopPx: vvOffsetTop,
    heightPx,
    bottomInsetPx,
  };
}

export function overlaySafeTopOverlapPx(vvOffsetTop: number, safeTopPx: number): number {
  return Math.max(0, Math.round(safeTopPx) - Math.round(vvOffsetTop));
}

export function computePinnedOverlayMaxHeightPx(
  frame: OverlayVisibleFrame,
  opts?: { safeTopPx?: number; gapPx?: number },
): number {
  const overlap = overlaySafeTopOverlapPx(frame.offsetTopPx, opts?.safeTopPx ?? 0);
  const gap = opts?.gapPx ?? 0;
  return Math.max(0, frame.heightPx - overlap - gap);
}

export function overlaySheetTopPx(
  innerHeight: number,
  sheetHeightPx: number,
  bottomInsetPx: number,
): number {
  return Math.round(innerHeight) - Math.round(bottomInsetPx) - Math.round(sheetHeightPx);
}

export function isOverlayChromeInVisualViewport(opts: {
  chromeTopPx: number;
  frame: OverlayVisibleFrame;
}): boolean {
  const { chromeTopPx, frame } = opts;
  return chromeTopPx + 0.5 >= frame.offsetTopPx && chromeTopPx < frame.offsetTopPx + frame.heightPx;
}

export type CssVarWrite = readonly [name: string, value: string];

export function computeVisualViewportCssVarWrites(opts: {
  innerHeight: number;
  vvHeight: number | null;
  vvOffsetTop: number | null;
}): CssVarWrite[] {
  const writes: CssVarWrite[] = [];
  const inner = Math.max(0, Math.round(opts.innerHeight));
  if (inner > 0) {
    writes.push([VISUAL_VIEWPORT_CSS_VAR.layoutInnerHeight, `${inner}px`]);
  }
  if (opts.vvHeight != null) {
    writes.push([
      VISUAL_VIEWPORT_CSS_VAR.vvHeight,
      `${Math.max(0, Math.round(opts.vvHeight))}px`,
    ]);
  }
  if (opts.vvOffsetTop != null) {
    writes.push([
      VISUAL_VIEWPORT_CSS_VAR.vvOffsetTop,
      `${Math.max(0, Math.round(opts.vvOffsetTop))}px`,
    ]);
  }
  return writes;
}

export function pickChangedCssVars(
  last: ReadonlyMap<string, string>,
  next: readonly CssVarWrite[],
): CssVarWrite[] {
  return next.filter(([name, value]) => last.get(name) !== value);
}

export function createFrameCoalescer(
  run: () => void,
  raf: (cb: FrameRequestCallback) => number = requestAnimationFrame,
  caf: (id: number) => void = cancelAnimationFrame,
): { schedule: () => void; cancel: () => void } {
  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = raf(() => {
      frame = 0;
      run();
    });
  };
  const cancel = () => {
    if (!frame) return;
    caf(frame);
    frame = 0;
  };
  return { schedule, cancel };
}
