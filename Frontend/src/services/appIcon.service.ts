import { DEFAULT_SPORT, Sports, type Sport } from '@shared/sport';
import {
  getFooterIconUrl,
  NATIVE_ALTERNATE_ICON_NAMES,
  type AppIconId,
  type BrandingSplashLogoKey,
  resolveNativeAppIconName,
} from '@/config/appIcons';
import { syncBrandingLogoToNative } from '@/services/authBridge';
import { isCapacitor, isIOS } from '@/utils/capacitor';
import { getUserPrimarySport, resolveActivePrimarySport } from '@/utils/profileSports';
import type { User } from '@/types';

const ANDROID_LAUNCHER_ALIASES = ['tiger', ...NATIVE_ALTERNATE_ICON_NAMES] as const;

const SPORT_BRANDING_SPLASH_KEY: Record<Sport, BrandingSplashLogoKey> = {
  [Sports.PADEL]: 'padel',
  [Sports.TENNIS]: 'tennis',
  [Sports.PICKLEBALL]: 'pickleball',
  [Sports.BADMINTON]: 'badminton',
  [Sports.TABLE_TENNIS]: 'table_tennis',
  [Sports.SQUASH]: 'squash',
};

function disableNamesForTarget(targetName: string): string[] {
  return ANDROID_LAUNCHER_ALIASES.filter((name) => name !== targetName);
}

export function nativeAppIconMatchesTarget(
  targetName: string,
  currentName: string | null | undefined,
): boolean {
  if (isIOS()) {
    if (targetName === 'tiger') return currentName == null;
    return currentName === targetName;
  }
  return currentName === targetName;
}

export function resolveAppIconSport(user: User | null | undefined): Sport {
  return resolveActivePrimarySport(user) ?? getUserPrimarySport(user);
}

export function resolveAppIconId(user: User | null | undefined): AppIconId {
  return user?.appIcon === 'racket' ? 'racket' : 'tiger';
}

export function getBrandingFooterIconUrl(user: User | null | undefined): string {
  return getFooterIconUrl(resolveAppIconId(user), user ? resolveAppIconSport(user) : DEFAULT_SPORT);
}

export function getBrandingSplashLogoKey(user: User | null | undefined): BrandingSplashLogoKey {
  if (!user) return 'padel';
  if (resolveAppIconId(user) === 'racket') return 'racket';
  return SPORT_BRANDING_SPLASH_KEY[resolveAppIconSport(user)];
}

export function getNativeAppIconSyncKey(user: User | null | undefined): string | null {
  if (!user) return null;
  return `${resolveAppIconId(user)}:${resolveAppIconSport(user)}`;
}

export async function setNativeAppIcon(
  appIconId: AppIconId,
  primarySport?: User['primarySport'] | null,
): Promise<void> {
  if (!isCapacitor()) return;
  try {
    const { AppIcon } = await import('@capacitor-community/app-icon');
    const supported = await AppIcon.isSupported();
    if (!supported?.value && isIOS()) return;

    const targetName = resolveNativeAppIconName(appIconId, primarySport);
    const { value: currentName } = await AppIcon.getName();
    if (nativeAppIconMatchesTarget(targetName, currentName)) return;

    const disable = disableNamesForTarget(targetName);

    if (isIOS() && targetName === 'tiger') {
      await AppIcon.reset({
        suppressNotification: true,
        disable: [...NATIVE_ALTERNATE_ICON_NAMES],
      });
      return;
    }

    await AppIcon.change({
      name: targetName,
      suppressNotification: true,
      disable,
    });
  } catch {
    // Plugin not installed or platform doesn't support
  }
}

export function syncBrandingLogoForUser(user: User | null | undefined): void {
  void syncBrandingLogoToNative(getBrandingSplashLogoKey(user));
}

export function syncNativeAppIconForUser(user: User | null | undefined): void {
  if (!user) return;
  const appIconId = resolveAppIconId(user);
  const sport = resolveAppIconSport(user);
  void setNativeAppIcon(appIconId, sport);
  syncBrandingLogoForUser(user);
}
