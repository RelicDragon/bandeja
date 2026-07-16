import { isAllowedGiphyHost } from '../giphyIngest/giphyHosts';

const BANDEJA_HOSTS = new Set(['bandeja.me', 'www.bandeja.me']);

export function isSkippedLinkPreviewHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (BANDEJA_HOSTS.has(host) || host.endsWith('.bandeja.me')) return true;
  if (isAllowedGiphyHost(host)) return true;
  return false;
}
