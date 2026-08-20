// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const media = vi.hoisted(() => {
  const state = { dark: false };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: state.dark && String(query).includes('prefers-color-scheme: dark'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }),
  });
  return state;
});

import { syncThemeOnForeground, useThemeStore } from './themeStore';

function htmlIsDark() {
  return document.documentElement.classList.contains('dark');
}

describe('syncThemeOnForeground', () => {
  beforeEach(() => {
    media.dark = false;
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
    window.localStorage.clear();
    useThemeStore.getState().setTheme('light');
  });

  it('applies OS dark on resume when preference is system and matchMedia changed with no event', () => {
    useThemeStore.getState().setTheme('system');
    expect(htmlIsDark()).toBe(false);

    media.dark = true;
    syncThemeOnForeground();

    expect(htmlIsDark()).toBe(true);
    expect(window.localStorage.getItem('theme')).toBe('system');
    expect(document.documentElement.style.colorScheme).toBe('light dark');
  });

  it('applies OS dark on the delayed reread when resume ran before matchMedia updated', () => {
    useThemeStore.getState().setTheme('system');
    expect(htmlIsDark()).toBe(false);

    syncThemeOnForeground();
    expect(htmlIsDark()).toBe(false);

    media.dark = true;
    syncThemeOnForeground();
    expect(htmlIsDark()).toBe(true);
    expect(window.localStorage.getItem('theme')).toBe('system');
  });

  it('applies OS light on resume when preference is system and UI is still dark', () => {
    media.dark = true;
    useThemeStore.getState().setTheme('system');
    expect(htmlIsDark()).toBe(true);

    media.dark = false;
    syncThemeOnForeground();

    expect(htmlIsDark()).toBe(false);
    expect(window.localStorage.getItem('theme')).toBe('system');
  });

  it('keeps manual dark when OS is light on resume', () => {
    useThemeStore.getState().setTheme('dark');
    media.dark = false;
    syncThemeOnForeground();

    expect(htmlIsDark()).toBe(true);
    expect(window.localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('keeps manual light when OS is dark on resume', () => {
    useThemeStore.getState().setTheme('light');
    media.dark = true;
    syncThemeOnForeground();

    expect(htmlIsDark()).toBe(false);
    expect(window.localStorage.getItem('theme')).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('does not toggle html.dark when system already matches OS', () => {
    media.dark = true;
    useThemeStore.getState().setTheme('system');
    expect(htmlIsDark()).toBe(true);

    const add = vi.spyOn(document.documentElement.classList, 'add');
    const remove = vi.spyOn(document.documentElement.classList, 'remove');
    syncThemeOnForeground();
    syncThemeOnForeground();

    expect(htmlIsDark()).toBe(true);
    expect(add).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    add.mockRestore();
    remove.mockRestore();
  });
});
