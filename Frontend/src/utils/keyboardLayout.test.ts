import { describe, expect, it } from 'vitest';
import {
  computeKeyboardInsetPx,
  shouldShiftDialogForKeyboard,
  isInsideKeyboardManagedSurface,
} from './keyboardLayout';

describe('computeKeyboardInsetPx', () => {
  it('prefers plugin inset on Android when visual viewport over-estimates keyboard', () => {
    const inset = computeKeyboardInsetPx({
      innerHeight: 800,
      vvHeight: 200,
      vvOffsetTop: 0,
      pluginInsetPx: 320,
      preferPluginInset: true,
    });
    expect(inset).toBe(320);
  });

  it('falls back to derived inset when plugin has not reported yet', () => {
    const inset = computeKeyboardInsetPx({
      innerHeight: 800,
      vvHeight: 500,
      vvOffsetTop: 0,
      pluginInsetPx: 0,
      preferPluginInset: true,
    });
    expect(inset).toBe(300);
  });

  it('uses max of derived and plugin when not preferring plugin', () => {
    const inset = computeKeyboardInsetPx({
      innerHeight: 800,
      vvHeight: 200,
      vvOffsetTop: 0,
      pluginInsetPx: 320,
      preferPluginInset: false,
    });
    expect(inset).toBe(600);
  });
});

describe('shouldShiftDialogForKeyboard', () => {
  it('shifts only when keyboard is visible and inset is above threshold', () => {
    expect(shouldShiftDialogForKeyboard(120, true)).toBe(true);
    expect(shouldShiftDialogForKeyboard(40, true)).toBe(false);
    expect(shouldShiftDialogForKeyboard(120, false)).toBe(false);
  });
});

describe('isInsideKeyboardManagedSurface', () => {
  it('returns false for null', () => {
    expect(isInsideKeyboardManagedSurface(null)).toBe(false);
  });
});
