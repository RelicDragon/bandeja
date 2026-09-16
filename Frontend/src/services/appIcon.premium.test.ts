import { expect, it, vi } from 'vitest';
import { getBrandingFooterIconUrl, resolveAppIconId } from './appIcon.service';
import type { User } from '@/types';

vi.mock('@/services/authBridge', () => ({ syncBrandingLogoToNative: vi.fn() }));

it('uses the gold tiger for Premium theme while preserving the chosen launcher icon', () => {
  const user = { isPremium: true, mainTheme: 'premium', appIcon: 'racket', primarySport: 'TENNIS', sportsEnabled: ['TENNIS'] } as User;
  expect(getBrandingFooterIconUrl(user)).toBe('/premium/bandeja-gold-crest.webp');
  expect(resolveAppIconId(user)).toBe('racket');
  expect(getBrandingFooterIconUrl({ ...user, mainTheme: 'classic' })).toBe('/orig_icons/racket-blue/bandeja-blue-flat.png');
  expect(getBrandingFooterIconUrl({ ...user, isPremium: false })).toBe('/orig_icons/racket-blue/bandeja-blue-flat.png');
  expect(getBrandingFooterIconUrl({ ...user, mainTheme: 'classic', appIcon: 'tiger' })).toBe('/bandeja2-tennis-white-tr.png');
  expect(getBrandingFooterIconUrl(null)).toBe('/bandeja2-white-tr.png');
});
