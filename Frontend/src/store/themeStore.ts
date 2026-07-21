import { useSyncExternalStore } from 'react';
import { create } from 'zustand';

interface ThemeState {
  theme: 'light' | 'dark' | 'system';
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

const getSystemTheme = (): 'light' | 'dark' => {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

function subscribeSystemTheme(cb: () => void) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

function getSystemThemeSnapshot() {
  return getSystemTheme();
}

const PAGE_BG = { light: '#f9fafb', dark: '#111827' } as const;

const applyTheme = (theme: 'light' | 'dark' | 'system') => {
  const actualTheme = theme === 'system' ? getSystemTheme() : theme;
  const root = document.documentElement;
  if (actualTheme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  root.style.colorScheme = actualTheme;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.setAttribute('content', PAGE_BG[actualTheme]);
  }
};

export const useThemeStore = create<ThemeState>((set) => {
  const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | 'system' | null;
  const initialTheme = savedTheme || 'light';

  applyTheme(initialTheme);

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleSystemThemeChange = () => {
    const currentTheme = useThemeStore.getState().theme;
    if (currentTheme === 'system') {
      applyTheme('system');
    }
  };

  mediaQuery.addEventListener('change', handleSystemThemeChange);

  return {
    theme: initialTheme,
    toggleTheme: () =>
      set((state) => {
        let newTheme: 'light' | 'dark' | 'system';
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

/** Resolved light/dark for UI and deep links (follows `system` via matchMedia). */
export function useResolvedAppAppearance(): 'light' | 'dark' {
  const theme = useThemeStore((s) => s.theme);
  const systemScheme = useSyncExternalStore<'light' | 'dark'>(
    subscribeSystemTheme,
    getSystemThemeSnapshot,
    () => 'light',
  );
  if (theme === 'system') return systemScheme;
  return theme;
}
