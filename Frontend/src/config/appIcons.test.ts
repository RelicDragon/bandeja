import { describe, expect, it } from 'vitest';
import { Sports } from '@shared/sport';
import {
  getAppIconPreviewUrl,
  getFooterIconUrl,
  getMemberThemeAppIconPreviewUrl,
  MEMBER_THEME_NATIVE_ICON,
  NATIVE_ALTERNATE_ICON_NAMES,
  getSportMascotFooterUrl,
  getSportMascotPreviewUrl,
  resolveNativeAppIconName,
} from './appIcons';
import {
  getBrandingFooterIconUrl,
  getBrandingSplashLogoKey,
  getNativeAppIconSyncKey,
  resolveAppIconSport,
} from '@/services/appIcon.service';
import type { User } from '@/types';

describe('appIcons', () => {
  it('resolves tiger native icon from primary sport', () => {
    expect(resolveNativeAppIconName('tiger', Sports.PADEL)).toBe('tiger');
    expect(resolveNativeAppIconName('tiger', Sports.TENNIS)).toBe('tennis');
    expect(resolveNativeAppIconName('tiger', null)).toBe('tiger');
    expect(resolveNativeAppIconName('tiger', undefined)).toBe('tiger');
  });

  it('keeps racket native icon independent of sport', () => {
    expect(resolveNativeAppIconName('racket', Sports.SQUASH)).toBe('racket');
  });

  it('lets an active member theme own the native icon', () => {
    expect(resolveNativeAppIconName('tiger', Sports.TENNIS, 'cyberpunk')).toBe('theme_cyberpunk');
    expect(resolveNativeAppIconName('racket', Sports.PADEL, 'premium')).toBe('theme_premium');
    expect(resolveNativeAppIconName('racket', Sports.PADEL, null)).toBe('racket');
    expect(getMemberThemeAppIconPreviewUrl('nordic')).toBe('/premium/app-icons/theme_nordic.webp');
    expect(resolveNativeAppIconName('tiger', Sports.PADEL, 'summer')).toBe('theme_summer');
  });

  it('registers every member theme icon as a native alternate', () => {
    for (const name of Object.values(MEMBER_THEME_NATIVE_ICON)) {
      expect(NATIVE_ALTERNATE_ICON_NAMES).toContain(name);
    }
  });

  it('builds sport mascot asset urls', () => {
    expect(getSportMascotPreviewUrl(Sports.PADEL)).toBe('/bandeja2-blue-45-icon.png');
    expect(getSportMascotPreviewUrl(Sports.TABLE_TENNIS)).toBe(
      '/bandeja2-table-tennis-blue-45-icon.png',
    );
    expect(getSportMascotFooterUrl(Sports.BADMINTON)).toBe('/bandeja2-badminton-white-tr.png');
  });

  it('uses primary sport for tiger footer and preview', () => {
    expect(getFooterIconUrl('tiger', Sports.PICKLEBALL)).toBe(
      '/bandeja2-pickleball-white-tr.png',
    );
    expect(getAppIconPreviewUrl('tiger', Sports.SQUASH)).toBe('/bandeja2-squash-blue-45-icon.png');
    expect(getFooterIconUrl('racket', Sports.TENNIS)).toContain('bandeja-blue-flat');
  });

  it('builds branding footer url from user profile', () => {
    const user = {
      appIcon: 'tiger',
      primarySport: Sports.TENNIS,
      sportsEnabled: [Sports.TENNIS],
    } as import('@/types').User;
    expect(getBrandingFooterIconUrl(user)).toBe('/bandeja2-tennis-white-tr.png');
    expect(getBrandingSplashLogoKey(user)).toBe('tennis');
    expect(getBrandingSplashLogoKey(null)).toBe('padel');
    expect(getBrandingFooterIconUrl(null)).toBe('/bandeja2-white-tr.png');
  });
});

describe('appIcon.service sync key', () => {
  const baseUser = {
    appIcon: 'tiger',
    primarySport: Sports.PADEL,
    sportsEnabled: [Sports.PADEL, Sports.TENNIS],
  } as User;

  it('changes sync key when app icon changes', () => {
    const before = getNativeAppIconSyncKey(baseUser);
    const after = getNativeAppIconSyncKey({ ...baseUser, appIcon: 'racket' });
    expect(before).not.toBe(after);
  });

  it('changes sync key when the member theme changes, ignoring it for non-members', () => {
    const premium = { ...baseUser, isPremium: true, mainTheme: 'spring' } as User;
    expect(getNativeAppIconSyncKey(premium)).not.toBe(getNativeAppIconSyncKey(baseUser));
    expect(getNativeAppIconSyncKey({ ...premium, mainTheme: 'ocean' })).not.toBe(
      getNativeAppIconSyncKey(premium),
    );
    expect(getNativeAppIconSyncKey({ ...premium, isPremium: false })).toBe(
      getNativeAppIconSyncKey(baseUser),
    );
  });

  it('changes sync key when primary sport changes', () => {
    const before = getNativeAppIconSyncKey(baseUser);
    const after = getNativeAppIconSyncKey({ ...baseUser, primarySport: Sports.TENNIS });
    expect(before).not.toBe(after);
    expect(resolveAppIconSport({ ...baseUser, primarySport: Sports.TENNIS })).toBe(Sports.TENNIS);
  });
});
