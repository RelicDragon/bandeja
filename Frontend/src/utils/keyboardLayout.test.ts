// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  computeKeyboardInsetPx,
  shouldShiftDialogForKeyboard,
  isInsideKeyboardManagedSurface,
  isSelfLiftingKeyboardBottomPanel,
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

  it('treats story DM bottom bar as keyboard-managed', () => {
    const panel = document.createElement('div');
    panel.className = 'cap-keyboard-aware-bottom-panel';
    const input = document.createElement('input');
    panel.appendChild(input);
    document.body.appendChild(panel);
    try {
      expect(isInsideKeyboardManagedSurface(input)).toBe(true);
      expect(isSelfLiftingKeyboardBottomPanel(input)).toBe(true);
    } finally {
      panel.remove();
    }
  });
});

describe('story DM keyboard matrix', () => {
  const phoneInnerH = 844;
  const keyboardH = 336;

  it('Capacitor iOS/Android: manual lift via --keyboard-height', () => {
    expect(
      resolveKeyboardLayoutMode({
        isCapacitor: true,
        baselineInnerHeight: phoneInnerH,
        currentInnerHeight: phoneInnerH,
        keyboardLikelyVisible: true,
      }),
    ).toBe('manual');

    const iosInset = computeKeyboardInsetPx({
      innerHeight: phoneInnerH,
      vvHeight: phoneInnerH - keyboardH,
      vvOffsetTop: 0,
      pluginInsetPx: keyboardH,
      preferPluginInset: false,
    });
    expect(iosInset).toBe(keyboardH);

    const androidInset = computeKeyboardInsetPx({
      innerHeight: phoneInnerH,
      vvHeight: phoneInnerH - keyboardH,
      vvOffsetTop: 0,
      pluginInsetPx: keyboardH,
      preferPluginInset: true,
    });
    expect(androidInset).toBe(keyboardH);
  });

  it('mobile browser native-resize: no manual --keyboard-height (browser shrinks layout)', () => {
    expect(
      resolveKeyboardLayoutMode({
        isCapacitor: false,
        baselineInnerHeight: phoneInnerH,
        currentInnerHeight: phoneInnerH - keyboardH,
        keyboardLikelyVisible: true,
      }),
    ).toBe('native-resize');
  });

  it('iOS Safari manual: visual viewport shrinks, layout viewport does not', () => {
    expect(
      resolveKeyboardLayoutMode({
        isCapacitor: false,
        baselineInnerHeight: phoneInnerH,
        currentInnerHeight: phoneInnerH,
        keyboardLikelyVisible: true,
      }),
    ).toBe('manual');

    const inset = computeKeyboardInsetPx({
      innerHeight: phoneInnerH,
      vvHeight: phoneInnerH - keyboardH,
      vvOffsetTop: 0,
      pluginInsetPx: 0,
    });
    expect(inset).toBe(keyboardH);
  });

  it('desktop / no keyboard: inactive mode, no inset', () => {
    expect(
      resolveKeyboardLayoutMode({
        isCapacitor: false,
        baselineInnerHeight: 900,
        currentInnerHeight: 900,
        keyboardLikelyVisible: false,
      }),
    ).toBe('inactive');
    expect(isKeyboardLikelyVisible(900, 900)).toBe(false);
    expect(shouldShiftDialogForKeyboard(0, false)).toBe(false);
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
