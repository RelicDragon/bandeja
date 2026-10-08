import { memberChromeIsDark, setMemberHeaderMounted, syncWebThemeColor, type MemberThemeId } from '@/utils/mainTheme';
import { useLayoutEffect } from 'react';
import { useResolvedAppAppearance } from '@/store/themeStore';

const darkMemberHeaders = new Set<symbol>();

/**
 * While a member header is mounted the theme-color meta follows its chrome, and a dark chrome
 * (`MEMBER_THEMES[id][appearance].chrome`) sets `html.premium-navigation` for light status-bar text.
 */
export function usePremiumNavigationAppearance(theme: MemberThemeId | null) {
  const appearance = useResolvedAppAppearance();

  useLayoutEffect(() => {
    if (!theme) return;
    const owner = Symbol('premium-header');
    const darkChrome = memberChromeIsDark(theme, appearance);
    const root = document.documentElement;
    setMemberHeaderMounted(true);
    if (darkChrome) {
      darkMemberHeaders.add(owner);
      root.classList.add('premium-navigation');
    }
    syncWebThemeColor();
    return () => {
      setMemberHeaderMounted(false);
      darkMemberHeaders.delete(owner);
      if (darkMemberHeaders.size === 0) root.classList.remove('premium-navigation');
      syncWebThemeColor();
    };
  }, [theme, appearance]);
}
