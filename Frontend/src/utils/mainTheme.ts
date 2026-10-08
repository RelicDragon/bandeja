import type { MainTheme, User } from '@/types';
import { setMemberThemeArrivalHeaderVisible } from './memberThemeArrival';

/** Every `MainTheme` except `classic`; each requires `isPremium` (docs/domains/premium-appearance.md). */
export const MEMBER_THEME_IDS = ['premium', 'spring', 'cyberpunk', 'steampunk', 'woodstone', 'ocean', 'nordic', 'alpine', 'summer'] as const satisfies readonly MainTheme[];
export type MemberThemeId = (typeof MEMBER_THEME_IDS)[number];
export type ResolvedAppearance = 'light' | 'dark';

export interface MemberThemeAppearance {
  /** Header/tab-bar tone. `dark` sets `html.premium-navigation` (light status-bar text). */
  chrome: 'light' | 'dark';
  /** `meta[name=theme-color]` while the member header is on screen. */
  themeColor: string;
  /** Document and native WebView backing behind the shell. */
  pageBackground: string;
  /** Solid colour sampled from the loader scene (`--mt-loading-bg`); the pre-React boot frame paints it. */
  loadingBackground: string;
}

export type MemberThemeDefinition = Record<ResolvedAppearance, MemberThemeAppearance>;

/** Status bar, theme-color meta and the native background read only this registry. */
export const MEMBER_THEMES: Record<MemberThemeId, MemberThemeDefinition> = {
  premium: {
    light: { chrome: 'dark', themeColor: '#11100e', pageBackground: '#faf9f6', loadingBackground: '#110c07' },
    dark: { chrome: 'dark', themeColor: '#11100e', pageBackground: '#141411', loadingBackground: '#110c07' },
  },
  spring: {
    light: { chrome: 'light', themeColor: '#eef6f1', pageBackground: '#f8faf6', loadingBackground: '#dcebf2' },
    dark: { chrome: 'dark', themeColor: '#123039', pageBackground: '#121815', loadingBackground: '#142a33' },
  },
  cyberpunk: {
    light: { chrome: 'dark', themeColor: '#07060f', pageBackground: '#f5f4fa', loadingBackground: '#0b0716' },
    dark: { chrome: 'dark', themeColor: '#07060f', pageBackground: '#100e1d', loadingBackground: '#0b0716' },
  },
  steampunk: {
    light: { chrome: 'dark', themeColor: '#1c140c', pageBackground: '#f7f2e8', loadingBackground: '#1f150c' },
    dark: { chrome: 'dark', themeColor: '#1c140c', pageBackground: '#16110c', loadingBackground: '#1f150c' },
  },
  woodstone: {
    light: { chrome: 'dark', themeColor: '#21170f', pageBackground: '#f4f5f4', loadingBackground: '#24180f' },
    dark: { chrome: 'dark', themeColor: '#21170f', pageBackground: '#131516', loadingBackground: '#24180f' },
  },
  ocean: {
    light: { chrome: 'dark', themeColor: '#0b1e31', pageBackground: '#f2f7f8', loadingBackground: '#061423' },
    dark: { chrome: 'dark', themeColor: '#0b1e31', pageBackground: '#0b141f', loadingBackground: '#061423' },
  },
  nordic: {
    light: { chrome: 'light', themeColor: '#f5f9fc', pageBackground: '#f6f9fb', loadingBackground: '#e6eff5' },
    dark: { chrome: 'dark', themeColor: '#0d1424', pageBackground: '#0f141c', loadingBackground: '#0b1322' },
  },
  alpine: {
    light: { chrome: 'light', themeColor: '#dce4ee', pageBackground: '#faf8f4', loadingBackground: '#e9dccb' },
    dark: { chrome: 'dark', themeColor: '#15183a', pageBackground: '#15131a', loadingBackground: '#2a2550' },
  },
  summer: {
    light: { chrome: 'light', themeColor: '#31b2ec', pageBackground: '#fbf9f4', loadingBackground: '#7fcdf1' },
    dark: { chrome: 'dark', themeColor: '#06162a', pageBackground: '#0f1517', loadingBackground: '#0a2236' },
  },
};

const CLASSIC_PAGE_BACKGROUND: Record<ResolvedAppearance, string> = { light: '#f9fafb', dark: '#111827' };

export function isMemberThemeId(value: unknown): value is MemberThemeId {
  return typeof value === 'string' && (MEMBER_THEME_IDS as readonly string[]).includes(value);
}

/** The member theme the app renders, or null for Classic (non-members and unknown values included). */
export function activeMemberTheme(user: Pick<User, 'isPremium' | 'mainTheme'> | null | undefined): MemberThemeId | null {
  if (user?.isPremium !== true) return null;
  return isMemberThemeId(user.mainTheme) ? user.mainTheme : null;
}

export function usesPremiumTheme(user: Pick<User, 'isPremium' | 'mainTheme'> | null | undefined): boolean {
  return activeMemberTheme(user) !== null;
}

export function memberChromeIsDark(theme: MemberThemeId | null, appearance: ResolvedAppearance): boolean {
  return theme !== null && MEMBER_THEMES[theme][appearance].chrome === 'dark';
}

export function appPageBackground(dark: boolean, theme: MemberThemeId | null): string {
  const appearance = dark ? 'dark' : 'light';
  return theme ? MEMBER_THEMES[theme][appearance].pageBackground : CLASSIC_PAGE_BACKGROUND[appearance];
}

/** The member theme currently applied to the document root (`html[data-member-theme]`). */
export function documentMemberTheme(): MemberThemeId | null {
  const root = document.documentElement;
  const id = root.dataset.memberTheme;
  return root.classList.contains('premium-theme') && isMemberThemeId(id) ? id : null;
}

let mountedMemberHeaders = 0;

/** Member headers on screen; the theme-color meta follows the chrome while any is mounted. */
export function setMemberHeaderMounted(mounted: boolean): void {
  mountedMemberHeaders = Math.max(0, mountedMemberHeaders + (mounted ? 1 : -1));
  setMemberThemeArrivalHeaderVisible(mountedMemberHeaders > 0);
}

export function syncWebThemeColor(): void {
  const root = document.documentElement;
  const dark = root.classList.contains('dark');
  const theme = documentMemberTheme();
  const chromeVisible = root.classList.contains('premium-navigation') || mountedMemberHeaders > 0;
  const color = theme && chromeVisible
    ? MEMBER_THEMES[theme][dark ? 'dark' : 'light'].themeColor
    : appPageBackground(dark, theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
}

/** Read by the index.html boot script: the loader-scene colour for the next cold start (before any CSS or JS). */
export const MEMBER_BOOT_BACKGROUND_KEY = 'member_boot_background';

export function persistMemberBootBackground(theme: MemberThemeId | null): void {
  try {
    if (!theme) {
      localStorage.removeItem(MEMBER_BOOT_BACKGROUND_KEY);
      return;
    }
    const { light, dark } = MEMBER_THEMES[theme];
    localStorage.setItem(MEMBER_BOOT_BACKGROUND_KEY, JSON.stringify({ theme, light: light.loadingBackground, dark: dark.loadingBackground }));
  } catch {
    // Storage may be unavailable; the boot frame then uses the page background.
  }
}
