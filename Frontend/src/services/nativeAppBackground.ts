import { Capacitor, registerPlugin } from '@capacitor/core';
import type { ThemePreference } from '@/store/applySystemThemeOnForeground';

const bridge = registerPlugin<{
  setAppAppearance(options: { appearance: ThemePreference; premium: boolean }): Promise<void>;
}>('AuthBridge');

export async function syncNativeAppBackground(appearance: ThemePreference, premium: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await bridge.setAppAppearance({ appearance, premium });
  } catch {
    // Older store builds still receive the CSS background until their next native update.
  }
}
