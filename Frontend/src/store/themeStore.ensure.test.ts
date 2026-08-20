// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

const start = vi.hoisted(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }),
  });
  return vi.fn(() => () => {});
});

vi.mock('./themeForegroundSync', () => ({
  startThemeForegroundSync: start,
}));

import { ensureThemeForegroundSync } from './themeStore';

describe('ensureThemeForegroundSync', () => {
  it('starts foreground sync once', () => {
    expect(start).toHaveBeenCalledTimes(1);
    ensureThemeForegroundSync();
    ensureThemeForegroundSync();
    expect(start).toHaveBeenCalledTimes(1);
  });
});
