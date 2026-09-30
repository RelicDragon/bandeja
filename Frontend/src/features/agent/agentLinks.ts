import { isAppPath } from '@/utils/urlSchema';

export type AgentLinkTarget =
  | { kind: 'internal'; path: string }
  | { kind: 'external'; url: string }
  | { kind: 'blocked' };

const APP_HOSTS = new Set(['bandeja.me', 'www.bandeja.me']);

/**
 * Markdown links in model output: in-app routes navigate through the router, http(s) opens
 * outside the app, everything else (javascript:, data:, tel:, relative junk) is not a link.
 */
export function classifyAgentLink(href: string | undefined | null): AgentLinkTarget {
  const raw = (href ?? '').trim();
  if (!raw) return { kind: 'blocked' };

  if (raw.startsWith('/') && !raw.startsWith('//')) {
    const pathOnly = raw.split(/[?#]/)[0];
    return isAppPath(pathOnly) ? { kind: 'internal', path: raw } : { kind: 'blocked' };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { kind: 'blocked' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { kind: 'blocked' };
  if (APP_HOSTS.has(url.hostname.toLowerCase()) && isAppPath(url.pathname)) {
    return { kind: 'internal', path: `${url.pathname}${url.search}${url.hash}` };
  }
  return { kind: 'external', url: url.toString() };
}
