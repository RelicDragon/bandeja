export type AppIconId = 'tiger' | 'racket';

export interface AppIconOption {
  id: AppIconId;
  name: string;
  previewUrl: string;
  footerIconUrl: string;
  nativeName: string | null;
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

export function getFooterIconUrl(appIconId: string | AppIconId | null | undefined): string {
  const id = appIconId === 'tiger' || appIconId === 'racket' ? appIconId : undefined;
  return getAppIconById(id).footerIconUrl;
}
