import { describe, expect, it } from 'vitest';
import { Sports } from '@shared/sport';
import {
  getAppIconPreviewUrl,
  getFooterIconUrl,
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

  it('changes sync key when primary sport changes', () => {
    const before = getNativeAppIconSyncKey(baseUser);
    const after = getNativeAppIconSyncKey({ ...baseUser, primarySport: Sports.TENNIS });
    expect(before).not.toBe(after);
    expect(resolveAppIconSport({ ...baseUser, primarySport: Sports.TENNIS })).toBe(Sports.TENNIS);
  });
});
