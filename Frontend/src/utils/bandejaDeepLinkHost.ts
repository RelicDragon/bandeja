/** Hosts treated as in-app Bandeja deep links (align with BE `isBandejaAppHost`). */
export function isBandejaDeepLinkHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host) return false;
  if (host === 'bandeja.me' || host === 'www.bandeja.me') return true;
  if (host.endsWith('.bandeja.me')) return true;
  return false;
}
