const DEFAULT_MAX_KEYBOARD_INSET_RATIO = 0.92;
export const KEYBOARD_DIALOG_SHIFT_THRESHOLD_PX = 80;

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

export function isInsideKeyboardManagedSurface(el: HTMLElement | null): boolean {
  if (!el) return false;
  return !!el.closest(
    '[data-cap-chat-composer], .chat-container footer, [role="dialog"], .cap-keyboard-aware-dialog',
  );
}
