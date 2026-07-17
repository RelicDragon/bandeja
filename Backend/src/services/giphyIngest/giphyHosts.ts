/** Hosts allowed for GIF provider paste resolve + media fetch (exact + mediaN patterns). */

const EXACT_HOSTS = new Set([
  'giphy.com',
  'www.giphy.com',
  'media.giphy.com',
  'i.giphy.com',
  'api.giphy.com',
  'klipy.com',
  'www.klipy.com',
  'api.klipy.com',
  'static.klipy.com',
  'static1.klipy.com',
  'static2.klipy.com',
  'tenor.com',
  'www.tenor.com',
  'media.tenor.com',
  'media1.tenor.com',
  'c.tenor.com',
  'tenor.co',
  'www.tenor.co',
  'media.tenor.co',
  'media1.tenor.co',
  'c.tenor.co',
]);

const MEDIA_HOST_RE = /^media\d*\.giphy\.com$/i;
const I_HOST_RE = /^i\d*\.giphy\.com$/i;
const TENOR_MEDIA_HOST_RE = /^(?:media\d*\.|c\.)tenor\.(?:com|co)$/i;

export function isAllowedGiphyHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host) return false;
  if (EXACT_HOSTS.has(host)) return true;
  if (MEDIA_HOST_RE.test(host)) return true;
  if (I_HOST_RE.test(host)) return true;
  if (TENOR_MEDIA_HOST_RE.test(host)) return true;
  return false;
}

export function isGiphyApiHost(hostname: string): boolean {
  return hostname.trim().toLowerCase().replace(/\.$/, '') === 'api.giphy.com';
}

export function isGiphyMediaHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  return MEDIA_HOST_RE.test(host) || I_HOST_RE.test(host);
}

export function isKlipyPageHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  return host === 'klipy.com' || host === 'www.klipy.com';
}

export function isKlipyMediaHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  return (
    host === 'static.klipy.com' ||
    host === 'static1.klipy.com' ||
    host === 'static2.klipy.com'
  );
}

export function isDirectKlipyMediaUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === '443') &&
      isKlipyMediaHost(url.hostname)
    );
  } catch {
    return false;
  }
}

export function isTenorPageHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  return (
    host === 'tenor.com' ||
    host === 'www.tenor.com' ||
    host === 'tenor.co' ||
    host === 'www.tenor.co'
  );
}

export function isTenorMediaHost(hostname: string): boolean {
  return TENOR_MEDIA_HOST_RE.test(hostname.trim().toLowerCase().replace(/\.$/, ''));
}

export function isDirectTenorMediaUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443') ||
      !isTenorMediaHost(url.hostname)
    ) {
      return false;
    }
    const path = url.pathname.toLowerCase();
    return /\.(gif|webp|png|jpe?g)$/i.test(path);
  } catch {
    return false;
  }
}
