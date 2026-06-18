import { describe, expect, it } from 'vitest';
import {
  computeKeyboardInsetPx,
  shouldShiftDialogForKeyboard,
  isInsideKeyboardManagedSurface,
  doesLayoutViewportShrinkWithKeyboard,
  isKeyboardLikelyVisible,
  resolveKeyboardLayoutMode,
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

describe('resolveKeyboardLayoutMode', () => {
  it('returns inactive when keyboard is not likely visible', () => {
    expect(
      resolveKeyboardLayoutMode({
        isCapacitor: false,
        baselineInnerHeight: 800,
        currentInnerHeight: 800,
        keyboardLikelyVisible: false,
      }),
    ).toBe('inactive');
  });

  it('returns manual for Capacitor even when layout viewport shrinks', () => {
    expect(
      resolveKeyboardLayoutMode({
        isCapacitor: true,
        baselineInnerHeight: 800,
        currentInnerHeight: 500,
        keyboardLikelyVisible: true,
      }),
    ).toBe('manual');
  });

  it('returns native-resize when mobile browser shrinks layout viewport', () => {
    expect(
      resolveKeyboardLayoutMode({
        isCapacitor: false,
        baselineInnerHeight: 800,
        currentInnerHeight: 500,
        keyboardLikelyVisible: true,
      }),
    ).toBe('native-resize');
  });

  it('returns manual when visual viewport shrinks but layout viewport does not', () => {
    expect(
      resolveKeyboardLayoutMode({
        isCapacitor: false,
        baselineInnerHeight: 800,
        currentInnerHeight: 800,
        keyboardLikelyVisible: true,
      }),
    ).toBe('manual');
  });
});

describe('doesLayoutViewportShrinkWithKeyboard', () => {
  it('detects significant inner height drop', () => {
    expect(doesLayoutViewportShrinkWithKeyboard(800, 720)).toBe(true);
    expect(doesLayoutViewportShrinkWithKeyboard(800, 721)).toBe(false);
  });
});

describe('isKeyboardLikelyVisible', () => {
  it('requires shrink above visibility threshold', () => {
    expect(isKeyboardLikelyVisible(800, 660)).toBe(false);
    expect(isKeyboardLikelyVisible(800, 649)).toBe(true);
  });
});
