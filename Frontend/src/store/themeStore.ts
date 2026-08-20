import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import {
  applySystemThemeOnForeground,
  type ResolvedTheme,
  type ThemePreference,
} from './applySystemThemeOnForeground';
import { startThemeForegroundSync } from './themeForegroundSync';

interface ThemeState {
  theme: ThemePreference;
  toggleTheme: () => void;
  setTheme: (theme: ThemePreference) => void;
}

const appearanceListeners = new Set<() => void>();

function emitAppearanceChange() {
  for (const cb of [...appearanceListeners]) cb();
}

const getSystemTheme = (): ResolvedTheme => {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
};

function readAppliedTheme(): ResolvedTheme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

function subscribeSystemTheme(cb: () => void) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', cb);
  appearanceListeners.add(cb);
  return () => {
    mq.removeEventListener('change', cb);
    appearanceListeners.delete(cb);
  };
}

function getSystemThemeSnapshot() {
  return getSystemTheme();
}

const PAGE_BG = { light: '#f9fafb', dark: '#111827' } as const;

function writeResolvedTheme(
  preference: ThemePreference,
  actualTheme: ResolvedTheme,
  writeClass: boolean,
) {
  const root = document.documentElement;
  if (writeClass) {
    if (actualTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }
  const colorScheme = preference === 'system' ? 'light dark' : actualTheme;
  if (root.style.colorScheme !== colorScheme) {
    root.style.colorScheme = colorScheme;
  }
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const nextColor = PAGE_BG[actualTheme];
  if (themeColor && themeColor.getAttribute('content') !== nextColor) {
    themeColor.setAttribute('content', nextColor);
  }
}

const applyTheme = (theme: ThemePreference) => {
  const decision = applySystemThemeOnForeground({
    preference: theme,
    systemScheme: getSystemTheme(),
    appliedTheme: readAppliedTheme(),
  });
  writeResolvedTheme(theme, decision.resolved, decision.shouldWrite);
};

function handleSystemThemeChange() {
  if (useThemeStore.getState().theme === 'system') {
    applyTheme('system');
  }
}

let systemThemeMql: MediaQueryList | null = null;

function listenForSystemThemeChanges() {
  try {
    const next = window.matchMedia('(prefers-color-scheme: dark)');
    next.addEventListener('change', handleSystemThemeChange);
    if (systemThemeMql && systemThemeMql !== next) {
      systemThemeMql.removeEventListener('change', handleSystemThemeChange);
    }
    systemThemeMql = next;
  } catch {
    return;
  }
}

export function syncThemeOnForeground() {
  listenForSystemThemeChanges();
  applyTheme(useThemeStore.getState().theme);
  emitAppearanceChange();
}

let stopThemeForegroundSync: (() => void) | null = null;

export function ensureThemeForegroundSync() {
  if (stopThemeForegroundSync) return;
  stopThemeForegroundSync = startThemeForegroundSync(syncThemeOnForeground);
}

export const useThemeStore = create<ThemeState>((set) => {
  const savedTheme = localStorage.getItem('theme');
  const initialTheme = isThemePreference(savedTheme) ? savedTheme : 'light';

  applyTheme(initialTheme);
  listenForSystemThemeChanges();

  return {
    theme: initialTheme,
    toggleTheme: () =>
      set((state) => {
        let newTheme: ThemePreference;
        if (state.theme === 'light') {
          newTheme = 'dark';
        } else if (state.theme === 'dark') {
          newTheme = 'system';
        } else {
          newTheme = 'light';
        }
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
        return { theme: newTheme };
      }),
    setTheme: (theme) => {
      localStorage.setItem('theme', theme);
      applyTheme(theme);
      set({ theme });
    },
  };
});

ensureThemeForegroundSync();

/** Resolved light/dark for UI and deep links (follows `system` via matchMedia). */
export function useResolvedAppAppearance(): ResolvedTheme {
  const theme = useThemeStore((s) => s.theme);
  const systemScheme = useSyncExternalStore<ResolvedTheme>(
    subscribeSystemTheme,
    getSystemThemeSnapshot,
    () => 'light',
  );
  if (theme === 'system') return systemScheme;
  return theme;
}
