import { isCapacitor } from '@/utils/capacitor';

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


