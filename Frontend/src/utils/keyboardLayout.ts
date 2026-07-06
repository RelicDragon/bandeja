const DEFAULT_MAX_KEYBOARD_INSET_RATIO = 0.92;
export const KEYBOARD_DIALOG_SHIFT_THRESHOLD_PX = 80;
export const KEYBOARD_VISIBILITY_THRESHOLD_PX = 150;
export const KEYBOARD_LAYOUT_SHRINK_THRESHOLD_PX = 80;

/** Manual CSS lift (--keyboard-height, keyboard-visible). Native = browser shrinks layout viewport. */
export type KeyboardLayoutMode = 'manual' | 'native-resize' | 'inactive';

export function doesLayoutViewportShrinkWithKeyboard(
  baselineInnerHeight: number,
  currentInnerHeight: number,
  thresholdPx: number = KEYBOARD_LAYOUT_SHRINK_THRESHOLD_PX,
): boolean {
  return baselineInnerHeight - currentInnerHeight >= thresholdPx;
}

export function isKeyboardLikelyVisible(
  baselineVvHeight: number,
  currentVvHeight: number,
  thresholdPx: number = KEYBOARD_VISIBILITY_THRESHOLD_PX,
): boolean {
  return baselineVvHeight - currentVvHeight > thresholdPx;
}

export function resolveKeyboardLayoutMode(opts: {
  isCapacitor: boolean;
  baselineInnerHeight: number;
  currentInnerHeight: number;
  keyboardLikelyVisible: boolean;
}): KeyboardLayoutMode {
  if (!opts.keyboardLikelyVisible) return 'inactive';
  if (opts.isCapacitor) return 'manual';
  if (
    doesLayoutViewportShrinkWithKeyboard(opts.baselineInnerHeight, opts.currentInnerHeight)
  ) {
    return 'native-resize';
  }
  return 'manual';
}

export function computeKeyboardInsetPx(opts: {
  innerHeight: number;
  vvHeight: number | null;
  vvOffsetTop: number | null;
  pluginInsetPx: number;
  maxInsetRatio?: number;
  preferPluginInset?: boolean;
}): number {
  const ratio = opts.maxInsetRatio ?? DEFAULT_MAX_KEYBOARD_INSET_RATIO;
  const maxInset = opts.innerHeight > 0 ? Math.round(opts.innerHeight * ratio) : 10_000;

  const derived =
    opts.vvHeight != null && opts.vvOffsetTop != null
      ? Math.max(0, Math.round(opts.innerHeight - opts.vvHeight - opts.vvOffsetTop))
      : 0;

  const raw =
    opts.preferPluginInset && opts.pluginInsetPx > 0
      ? opts.pluginInsetPx
      : Math.max(derived, opts.pluginInsetPx);

  return Math.min(raw, maxInset);
}

export function shouldShiftDialogForKeyboard(
  effectiveInsetPx: number,
  keyboardVisible: boolean,
  thresholdPx: number = KEYBOARD_DIALOG_SHIFT_THRESHOLD_PX,
): boolean {
  return keyboardVisible && effectiveInsetPx >= thresholdPx;
}

/* Surfaces that lift themselves above the keyboard (CSS shift on
   --keyboard-height); inputs inside only need a local nearest-scroll. */
export function isInsideKeyboardManagedSurface(el: HTMLElement | null): boolean {
  if (!el) return false;
  return !!el.closest(
    '[data-cap-chat-composer], .chat-container footer, .cap-keyboard-aware-dialog, .cap-keyboard-aware-sheet, .cap-keyboard-aware-overlay, .cap-keyboard-aware-bottom-panel, .cap-fullscreen-dialog-body, .fullscreen-dialog-root',
  );
}

/** Bottom panels that set `bottom: var(--keyboard-height)` — no scroll assist needed. */
export function isSelfLiftingKeyboardBottomPanel(el: HTMLElement | null): boolean {
  if (!el) return false;
  return !!el.closest('.cap-keyboard-aware-bottom-panel');
}
