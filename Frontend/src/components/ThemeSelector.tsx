import { useState, useEffect, useRef } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '@/store/themeStore';

const HINT_MS = 1500;

export const ThemeSelector = () => {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useThemeStore();
  const [hintVisible, setHintVisible] = useState(false);
  const [hintLabel, setHintLabel] = useState('');
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const themes = {
    light: { label: t('profile.light'), icon: Sun },
    dark: { label: t('profile.dark'), icon: Moon },
    system: { label: t('profile.system'), icon: Monitor },
  } as const;

  const current = themes[theme];
  const CurrentIcon = current.icon;

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const handleClick = () => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    toggleTheme();
    setHintLabel(themes[next].label);
    setHintVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setHintVisible(false), HINT_MS);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/90 bg-white/85 shadow-sm backdrop-blur-sm transition-all hover:bg-white dark:border-slate-600/80 dark:bg-slate-800/85 dark:hover:bg-slate-800"
        aria-label={`${t('profile.theme')}: ${current.label}`}
      >
        <CurrentIcon size={16} className="text-slate-600 dark:text-slate-200" />
      </button>

      <div
        className={`pointer-events-none absolute right-0 top-full z-30 mt-1.5 whitespace-nowrap rounded-lg border border-slate-200/90 bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-md backdrop-blur-sm transition-all duration-200 dark:border-slate-600/80 dark:bg-slate-800/95 dark:text-slate-200 ${
          hintVisible ? 'translate-y-0 opacity-100' : '-translate-y-0.5 opacity-0'
        }`}
        aria-live="polite"
      >
        {hintLabel || current.label}
      </div>
    </div>
  );
};
