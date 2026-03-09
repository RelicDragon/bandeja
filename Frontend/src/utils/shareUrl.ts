import { isCapacitor } from '@/utils/capacitor';
import { buildUrl } from '@/utils/urlSchema';

const DEFAULT_WEB_BASE_URL = 'https://bandeja.me';

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, '');

export const getShareUrl = () => {
  const href = window.location.href;
  if (!isCapacitor()) return href;

  const baseUrl =
    import.meta.env.VITE_WEB_BASE_URL ||
    import.meta.env.VITE_SITE_URL ||
    DEFAULT_WEB_BASE_URL;

  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return `${normalizeBaseUrl(baseUrl)}${path.startsWith('/') ? path : `/${path}`}`;
};

export function getGroupChannelShareUrl(groupChannel: { id: string; isChannel: boolean }): string {
  const path = buildUrl(groupChannel.isChannel ? 'channelChat' : 'groupChat', { id: groupChannel.id });
  if (!isCapacitor()) return `${window.location.origin}${path}`;
  const baseUrl =
    import.meta.env.VITE_WEB_BASE_URL ||
    import.meta.env.VITE_SITE_URL ||
    DEFAULT_WEB_BASE_URL;
  return `${normalizeBaseUrl(baseUrl)}${path}`;
}


