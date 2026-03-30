import { isCapacitor } from '@/utils/capacitor';
import { buildUrl } from '@/utils/urlSchema';

const DEFAULT_WEB_BASE_URL = 'https://bandeja.me';

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, '');

/** Public web origin for links shared outside the app (avoids localhost / deep links). */
export function getPublicWebBaseUrl(): string {
  return normalizeBaseUrl(
    import.meta.env.VITE_WEB_BASE_URL ||
      import.meta.env.VITE_SITE_URL ||
      DEFAULT_WEB_BASE_URL,
  );
}

/** Marketing / signup URL — never use current page or private context IDs. */
export function getAppInviteUrl(): string {
  return `${getPublicWebBaseUrl()}/`;
}

export const getShareUrl = () => {
  const href = window.location.href;
  if (!isCapacitor()) return href;

  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return `${getPublicWebBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
};

export function getGroupChannelShareUrl(groupChannel: { id: string; isChannel: boolean }): string {
  const path = buildUrl(groupChannel.isChannel ? 'channelChat' : 'groupChat', { id: groupChannel.id });
  if (!isCapacitor()) return `${window.location.origin}${path}`;
  return `${getPublicWebBaseUrl()}${path}`;
}


