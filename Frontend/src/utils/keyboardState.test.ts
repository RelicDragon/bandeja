// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { getKeyboardState, publishKeyboardState, subscribeKeyboardState } from './keyboardState';

describe('publishKeyboardState', () => {
  it('skips DOM writes and listeners when inset and visibility are unchanged', () => {
    publishKeyboardState({ visible: true, insetPx: 336 });
    document.documentElement.style.setProperty('--keyboard-height', '999px');
    let notifications = 0;
    const unsubscribe = subscribeKeyboardState(() => {
      notifications += 1;
    });
    try {
      publishKeyboardState({ visible: true, insetPx: 336 });
      expect(document.documentElement.style.getPropertyValue('--keyboard-height')).toBe('999px');
      expect(notifications).toBe(0);
      expect(getKeyboardState()).toEqual({ visible: true, insetPx: 336 });
    } finally {
      unsubscribe();
      publishKeyboardState({ visible: false, insetPx: 0 });
    }
  });

  it('writes --keyboard-height when the inset changes', () => {
    publishKeyboardState({ visible: true, insetPx: 120 });
    try {
      expect(document.documentElement.style.getPropertyValue('--keyboard-height')).toBe('120px');
      expect(document.body.classList.contains('keyboard-visible')).toBe(true);
      expect(document.body.classList.contains('keyboard-dialog-shift')).toBe(true);
    } finally {
      publishKeyboardState({ visible: false, insetPx: 0 });
    }
  });
});
