import { isBandejaDeepLinkHost } from '@/utils/bandejaDeepLinkHost';

const GIPHY_HOST_RE = /(^|\.)giphy\.com$/i;

export function isGiphyLinkHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  return GIPHY_HOST_RE.test(host);
}

/** URLs eligible for chat external link preview (chip + optional rich card). */
export function isEligibleExternalLinkPreviewUrl(urlString: string): boolean {
  try {
    const u = new URL(urlString);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    if (isBandejaDeepLinkHost(u.hostname)) return false;
    if (isGiphyLinkHost(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}
