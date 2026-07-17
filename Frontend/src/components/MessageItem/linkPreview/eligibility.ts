import { isBandejaDeepLinkHost } from '@/utils/bandejaDeepLinkHost';

const GIPHY_HOST_RE = /(^|\.)giphy\.com$/i;

export function isGiphyLinkHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  return GIPHY_HOST_RE.test(host);
}

export function isAppLinkPreviewHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host) return false;
  if (isBandejaDeepLinkHost(host)) return true;
  if (host === 'localhost' || host === '127.0.0.1') return true;
  if (typeof window !== 'undefined' && window.location.hostname === host) return true;
  return false;
}

/** Chip + optional rich card (bandeja DB or external OG). Skips Giphy. */
export function isEligibleLinkPreviewUrl(urlString: string): boolean {
  try {
    const u = new URL(urlString);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    if (isGiphyLinkHost(u.hostname)) return false;
    // External unfurl is HTTPS-only on BE — avoid eternal chip for http:// sites.
    if (u.protocol === 'http:' && !isAppLinkPreviewHost(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}
