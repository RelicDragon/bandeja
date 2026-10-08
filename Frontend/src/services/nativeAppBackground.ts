import { Capacitor, registerPlugin } from '@capacitor/core';
import type { ThemePreference } from '@/store/applySystemThemeOnForeground';
import { appPageBackground, type MemberThemeId } from '@/utils/mainTheme';

const bridge = registerPlugin<{
  setAppAppearance(options: {
    appearance: ThemePreference;
    premium: boolean;
    memberTheme: MemberThemeId | null;
    lightBackground: string;
    darkBackground: string;
  }): Promise<void>;
}>('AuthBridge');

/**
 * `premium` stays for shipped native shells (they paint the Obsidian Gold backing for any member theme);
 * newer shells can read the exact per-appearance colours from the registry.
 */
export async function syncNativeAppBackground(appearance: ThemePreference, theme: MemberThemeId | null): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await bridge.setAppAppearance({
      appearance,
      premium: theme !== null,
      memberTheme: theme,
      lightBackground: appPageBackground(false, theme),
      darkBackground: appPageBackground(true, theme),
    });
  } catch {
    // Older store builds still receive the CSS background until their next native update.
  }
}
