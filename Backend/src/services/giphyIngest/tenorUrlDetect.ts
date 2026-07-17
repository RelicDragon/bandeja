import { isDirectTenorMediaUrl, isTenorMediaHost, isTenorPageHost } from './giphyHosts';
import { ssrfSafeFetchBytes, type DnsLookupFn } from './ssrfSafeFetch';

const OG_IMAGE_RE =
  /<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]*>/gi;

/** media1.tenor.com/m/{idSize}/{file} → stable media.tenor.com / c.tenor.com paths. */
const MEDIA_M_PATH_RE = /^\/m\/([^/]+)\/(.+\.(?:gif|webp|png|jpe?g))$/i;

export type TenorResolveDeps = {
  fetchFn?: typeof fetch;
  lookupFn?: DnsLookupFn;
};

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function normalizeCandidateUrl(raw: string): string | null {
  const trimmed = decodeHtmlEntities(raw).trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:') url.protocol = 'https:';
    url.hash = '';
    return isDirectTenorMediaUrl(url.toString()) ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Expand a Tenor media URL into download candidates.
 * og:image often uses media1.tenor.com/m/... which 404s; rewritten hosts work.
 */
export function expandTenorMediaUrlCandidates(urlString: string): string[] {
  const out: string[] = [];
  const push = (raw: string) => {
    const normalized = normalizeCandidateUrl(raw);
    if (normalized && !out.includes(normalized)) out.push(normalized);
  };

  push(urlString);

  try {
    const parsed = new URL(urlString);
    if (!isTenorMediaHost(parsed.hostname)) return out;
    const match = MEDIA_M_PATH_RE.exec(parsed.pathname);
    if (!match?.[1] || !match[2]) return out;
    const idSize = match[1];
    const file = match[2];
    push(`https://media.tenor.com/${idSize}/${file}`);
    push(`https://c.tenor.com/${idSize}/${file}`);
    // Prefer tiny/nano share size when og points at medium (AAAAC).
    if (/AAAAC$/i.test(idSize)) {
      const tinyId = `${idSize.slice(0, -5)}AAAAM`;
      const tinyFile = file.replace(/AAAAC/i, 'AAAAM');
      push(`https://media.tenor.com/${tinyId}/${tinyFile}`);
      push(`https://c.tenor.com/${tinyId}/${tinyFile}`);
    }
  } catch {
    return out;
  }

  // Prefer stable hosts first (media.tenor.com / c.tenor.com before mediaN/m).
  return out.sort((a, b) => scoreTenorMediaUrl(b) - scoreTenorMediaUrl(a));
}

function scoreTenorMediaUrl(urlString: string): number {
  try {
    const url = new URL(urlString);
    const host = url.hostname.toLowerCase();
    let score = 0;
    if (host === 'media.tenor.com' || host === 'media.tenor.co') score += 40;
    else if (host === 'c.tenor.com' || host === 'c.tenor.co') score += 30;
    else score += 10;
    if (!url.pathname.toLowerCase().startsWith('/m/')) score += 20;
    if (/\.gif(?:$|[?#])/i.test(url.pathname)) score += 10;
    if (/AAAAM\//i.test(url.pathname) || /AAAAM\./i.test(url.pathname)) score += 5;
    return score;
  } catch {
    return 0;
  }
}

/** Prefer GIF, then webp/png/jpeg from HTML meta / media links. */
export function extractTenorMediaUrlFromHtml(html: string): string | null {
  return extractTenorMediaCandidatesFromHtml(html)[0] ?? null;
}

export function extractTenorMediaCandidatesFromHtml(html: string): string[] {
  const collect = (rawUrls: string[]): string[] => {
    const found: string[] = [];
    for (const raw of rawUrls) {
      for (const candidate of expandTenorMediaUrlCandidates(raw)) {
        if (!found.includes(candidate)) found.push(candidate);
      }
    }
    return found.sort((a, b) => scoreTenorMediaUrl(b) - scoreTenorMediaUrl(a));
  };

  const ogUrls: string[] = [];
  OG_IMAGE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = OG_IMAGE_RE.exec(html)) !== null) {
    const raw = (match[1] ?? match[2] ?? '').trim();
    if (raw) ogUrls.push(raw);
  }
  const fromOg = collect(ogUrls);
  // Only the target GIF — never mix related media.* links from the page body.
  if (fromOg.length) return fromOg;

  const loose =
    html.match(
      /https:\/\/(?:media\d*\.|c\.)tenor\.(?:com|co)\/[^\s"'<>]+\.(?:gif|webp|png|jpe?g)/gi
    ) ?? [];
  return collect(loose);
}

export function isTenorProviderUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return isTenorPageHost(url.hostname) || isTenorMediaHost(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Resolve pasted Tenor URL → direct media download URL candidates (best first).
 * Direct CDN URLs pass through (with rewrite fallbacks); page URLs use og:image.
 */
export async function resolveTenorMediaDownloadUrls(
  pastedUrl: string,
  deps: TenorResolveDeps = {}
): Promise<string[]> {
  let parsed: URL;
  try {
    parsed = new URL(pastedUrl);
  } catch {
    return [];
  }

  if (isTenorMediaHost(parsed.hostname)) {
    return expandTenorMediaUrlCandidates(pastedUrl);
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    (parsed.port && parsed.port !== '443') ||
    !isTenorPageHost(parsed.hostname)
  ) {
    return [];
  }

  try {
    const { buffer } = await ssrfSafeFetchBytes(pastedUrl, {
      fetchFn: deps.fetchFn,
      lookupFn: deps.lookupFn,
      maxBytes: 512 * 1024,
      timeoutMs: 5_000,
    });
    return extractTenorMediaCandidatesFromHtml(buffer.toString('utf8'));
  } catch {
    return [];
  }
}

export async function resolveTenorMediaDownloadUrl(
  pastedUrl: string,
  deps: TenorResolveDeps = {}
): Promise<string | null> {
  const urls = await resolveTenorMediaDownloadUrls(pastedUrl, deps);
  return urls[0] ?? null;
}
