import { DEFAULT_SPORT, Sports, type Sport } from '@shared/sport';

export type BrandingSplashLogoKey =
  | 'padel'
  | 'tennis'
  | 'pickleball'
  | 'badminton'
  | 'table_tennis'
  | 'squash'
  | 'racket';

export type AppIconId = 'tiger' | 'racket';

export interface AppIconOption {
  id: AppIconId;
  name: string;
  previewUrl: string;
  footerIconUrl: string;
  nativeName: string | null;
}

export const NATIVE_ALTERNATE_ICON_NAMES = [
  'racket',
  'tennis',
  'pickleball',
  'badminton',
  'table_tennis',
  'squash',
] as const;

export type NativeAlternateIconName = (typeof NATIVE_ALTERNATE_ICON_NAMES)[number];

const SPORT_MASCOT_SLUG: Record<Sport, string | null> = {
  [Sports.PADEL]: null,
  [Sports.TENNIS]: 'tennis',
  [Sports.PICKLEBALL]: 'pickleball',
  [Sports.BADMINTON]: 'badminton',
  [Sports.TABLE_TENNIS]: 'table-tennis',
  [Sports.SQUASH]: 'squash',
};

const SPORT_NATIVE_TIGER_ICON: Record<Sport, string> = {
  [Sports.PADEL]: 'tiger',
  [Sports.TENNIS]: 'tennis',
  [Sports.PICKLEBALL]: 'pickleball',
  [Sports.BADMINTON]: 'badminton',
  [Sports.TABLE_TENNIS]: 'table_tennis',
  [Sports.SQUASH]: 'squash',
};

export function getSportMascotPreviewUrl(sport: Sport | null | undefined): string {
  const slug = SPORT_MASCOT_SLUG[sport ?? DEFAULT_SPORT];
  if (!slug) return '/bandeja2-blue-45-icon.png';
  return `/bandeja2-${slug}-blue-45-icon.png`;
}

export function getSportMascotFooterUrl(sport: Sport | null | undefined): string {
  const slug = SPORT_MASCOT_SLUG[sport ?? DEFAULT_SPORT];
  if (!slug) return '/bandeja2-white-tr.png';
  return `/bandeja2-${slug}-white-tr.png`;
}

export function resolveNativeAppIconName(
  appIconId: AppIconId,
  primarySport: Sport | null | undefined,
): string {
  if (appIconId === 'racket') return 'racket';
  return SPORT_NATIVE_TIGER_ICON[primarySport ?? DEFAULT_SPORT];
}

export const APP_ICONS: AppIconOption[] = [
  {
    id: 'tiger',
    name: 'Tiger',
    previewUrl: '/bandeja2-blue-45-icon.png',
    footerIconUrl: '/bandeja2-white-tr.png',
    nativeName: null,
  },
  {
    id: 'racket',
    name: 'Racket',
    previewUrl: '/orig_icons/racket-blue/bandeja-blue-icon.png',
    footerIconUrl: '/orig_icons/racket-blue/bandeja-blue-flat.png',
    nativeName: 'racket',
  },
];

export const DEFAULT_APP_ICON: AppIconId = 'tiger';

export function getAppIconById(id: AppIconId | null | undefined): AppIconOption {
  const found = APP_ICONS.find((o) => o.id === (id || DEFAULT_APP_ICON));
  return found ?? APP_ICONS[0];
}

export function getFooterIconUrl(
  appIconId: string | AppIconId | null | undefined,
  primarySport?: Sport | null,
): string {
  const id = appIconId === 'tiger' || appIconId === 'racket' ? appIconId : DEFAULT_APP_ICON;
  if (id === 'tiger') return getSportMascotFooterUrl(primarySport);
  return getAppIconById(id).footerIconUrl;
}

export function getAppIconPreviewUrl(
  appIconId: AppIconId,
  primarySport?: Sport | null,
): string {
  if (appIconId === 'tiger') return getSportMascotPreviewUrl(primarySport);
  return getAppIconById(appIconId).previewUrl;
}
