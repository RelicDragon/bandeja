/** Hosts allowed for Giphy paste resolve + media fetch (exact + mediaN / iN patterns). */

const EXACT_HOSTS = new Set([
  'giphy.com',
  'www.giphy.com',
  'media.giphy.com',
  'i.giphy.com',
  'api.giphy.com',
]);

const MEDIA_HOST_RE = /^media\d*\.giphy\.com$/i;
const I_HOST_RE = /^i\d*\.giphy\.com$/i;

export function isAllowedGiphyHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host) return false;
  if (EXACT_HOSTS.has(host)) return true;
  if (MEDIA_HOST_RE.test(host)) return true;
  if (I_HOST_RE.test(host)) return true;
  return false;
}

export function isGiphyApiHost(hostname: string): boolean {
  return hostname.trim().toLowerCase().replace(/\.$/, '') === 'api.giphy.com';
}
