// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/nativeAppBackground', () => ({ syncNativeAppBackground: vi.fn() }));
import { syncNativeAppBackground } from '@/services/nativeAppBackground';

vi.mock('./themeForegroundSync', () => ({
  startThemeForegroundSync: () => () => {},
}));

const media = vi.hoisted(() => {
  const state = {
    dark: false,
    add: vi.fn(),
    remove: vi.fn(),
  };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: state.dark && String(query).includes('prefers-color-scheme: dark'),
      media: query,
      addEventListener: state.add,
      removeEventListener: state.remove,
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }),
  });
  return state;
});

import { syncThemeOnForeground, useThemeStore, setPremiumAppTheme } from './themeStore';

function htmlIsDark() {
  return document.documentElement.classList.contains('dark');
}

describe('syncThemeOnForeground', () => {
  beforeEach(() => {
    media.dark = false;
    media.add.mockClear();
    media.remove.mockClear();
    document.documentElement.classList.remove('dark', 'premium-theme', 'premium-navigation');
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

  it('rebinds matchMedia on foreground so a frozen list can emit again', () => {
    const addsBefore = media.add.mock.calls.length;
    syncThemeOnForeground();
    expect(media.add.mock.calls.length).toBeGreaterThan(addsBefore);
    expect(media.remove).toHaveBeenCalled();
  });
});

it('syncs Premium/Classic backgrounds and native preferences across theme changes and resume', () => {
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  document.head.append(meta);
  try {
    useThemeStore.getState().setTheme('light');
    setPremiumAppTheme(true);
    expect(meta.content).toBe('#faf9f6');
    expect(syncNativeAppBackground).toHaveBeenLastCalledWith('light', true);
    useThemeStore.getState().setTheme('dark');
    expect(meta.content).toBe('#141411');
    setPremiumAppTheme(false);
    expect(meta.content).toBe('#111827');
    expect(syncNativeAppBackground).toHaveBeenLastCalledWith('dark', false);
    setPremiumAppTheme(true);
    useThemeStore.getState().setTheme('system');
    media.dark = false;
    syncThemeOnForeground();
    expect(meta.content).toBe('#faf9f6');
    media.dark = true;
    syncThemeOnForeground();
    expect(meta.content).toBe('#141411');
    expect(syncNativeAppBackground).toHaveBeenLastCalledWith('system', true);
    document.documentElement.classList.add('premium-navigation');
    useThemeStore.getState().setTheme('light');
    expect(meta.content).toBe('#11100e');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  } finally {
    meta.remove();
    document.documentElement.classList.remove('premium-navigation');
    setPremiumAppTheme(false);
  }
});
