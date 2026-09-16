import { syncWebThemeColor } from '@/utils/mainTheme';
import { useLayoutEffect } from 'react';
import { useResolvedAppAppearance } from '@/store/themeStore';

const activePremiumHeaders = new Set<symbol>();

/** The status bar sits over the dark Premium header even in a light app theme. */
export function usePremiumNavigationAppearance(isPremium: boolean) {
  const appearance = useResolvedAppAppearance();

  useLayoutEffect(() => {
    if (!isPremium) return;
    const owner = Symbol('premium-header');
    activePremiumHeaders.add(owner);
    const root = document.documentElement;
    root.classList.add('premium-navigation');
    syncWebThemeColor();
    return () => {
      activePremiumHeaders.delete(owner);
      if (activePremiumHeaders.size > 0) return;
      root.classList.remove('premium-navigation');
      syncWebThemeColor();
    };
  }, [isPremium, appearance]);
}
