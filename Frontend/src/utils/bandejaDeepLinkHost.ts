export function isBandejaDeepLinkHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'bandeja.me' || host === 'www.bandeja.me';
}
