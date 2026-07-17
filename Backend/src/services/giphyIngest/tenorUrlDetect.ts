import { isDirectTenorMediaUrl, isTenorMediaHost, isTenorPageHost } from './giphyHosts';
import { ssrfSafeFetchBytes, type DnsLookupFn } from './ssrfSafeFetch';

const OG_IMAGE_RE =
  /<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]*>/gi;

export type TenorResolveDeps = {
  fetchFn?: typeof fetch;
  lookupFn?: DnsLookupFn;
};

function normalizeCandidateUrl(raw: string): string | null {
  const trimmed = raw.trim();
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

/** Prefer GIF, then webp/png/jpeg from HTML meta / media links. */
export function extractTenorMediaUrlFromHtml(html: string): string | null {
  let gif: string | null = null;
  let other: string | null = null;
  OG_IMAGE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = OG_IMAGE_RE.exec(html)) !== null) {
    const candidate = normalizeCandidateUrl(match[1] ?? match[2] ?? '');
    if (!candidate) continue;
    if (/\.gif(?:$|[?#])/i.test(candidate)) {
      gif = candidate;
      break;
    }
    other ??= candidate;
  }
  if (gif || other) return gif ?? other;

  // Fallback: first allowlisted media.*.tenor.* image URL in the document.
  const loose = html.match(
    /https:\/\/(?:media\d*\.|c\.)tenor\.(?:com|co)\/[^\s"'<>]+\.(?:gif|webp|png|jpe?g)/gi
  );
  if (!loose?.length) return null;
  for (const raw of loose) {
    const candidate = normalizeCandidateUrl(raw);
    if (candidate && /\.gif(?:$|[?#])/i.test(candidate)) return candidate;
  }
  for (const raw of loose) {
    const candidate = normalizeCandidateUrl(raw);
    if (candidate) return candidate;
  }
  return null;
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
 * Resolve pasted Tenor URL → direct media download URL.
 * Direct CDN URLs pass through; page URLs use og:image (Tenor API is discontinued).
 */
export async function resolveTenorMediaDownloadUrl(
  pastedUrl: string,
  deps: TenorResolveDeps = {}
): Promise<string | null> {
  if (isDirectTenorMediaUrl(pastedUrl)) return pastedUrl;

  let parsed: URL;
  try {
    parsed = new URL(pastedUrl);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    (parsed.port && parsed.port !== '443') ||
    !isTenorPageHost(parsed.hostname)
  ) {
    return null;
  }

  try {
    const { buffer } = await ssrfSafeFetchBytes(pastedUrl, {
      fetchFn: deps.fetchFn,
      lookupFn: deps.lookupFn,
      maxBytes: 512 * 1024,
      timeoutMs: 5_000,
    });
    return extractTenorMediaUrlFromHtml(buffer.toString('utf8'));
  } catch {
    return null;
  }
}
