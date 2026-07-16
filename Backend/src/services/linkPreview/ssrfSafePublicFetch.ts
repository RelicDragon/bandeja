import dns from 'node:dns/promises';
import {
  isBlockedIpAddress,
  readResponseBodyCapped,
  SsrfFetchError,
  type DnsLookupFn,
} from '../giphyIngest/ssrfSafeFetch';

export { SsrfFetchError };

export const LINK_PREVIEW_FETCH_TIMEOUT_MS = 3_500;
export const LINK_PREVIEW_MAX_REDIRECTS = 3;
export const LINK_PREVIEW_MAX_BYTES = 512 * 1024;

export type SsrfSafePublicFetchOptions = {
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  fetchFn?: typeof fetch;
  lookupFn?: DnsLookupFn;
  userAgent?: string;
  accept?: string;
};

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name;
  return name === 'AbortError' || name === 'TimeoutError';
}

async function assertHostnameResolvesPublic(
  hostname: string,
  lookupFn: DnsLookupFn
): Promise<void> {
  let results: Array<{ address: string; family: 4 | 6 }>;
  try {
    results = await lookupFn(hostname);
  } catch {
    throw new SsrfFetchError('DNS lookup failed');
  }
  if (!results.length) throw new SsrfFetchError('DNS lookup failed');
  for (const result of results) {
    if (isBlockedIpAddress(result.address)) {
      throw new SsrfFetchError('Resolved IP is not allowed');
    }
  }
}

export function assertPublicHttpsUrl(urlString: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new SsrfFetchError('Invalid URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new SsrfFetchError('Only HTTPS is allowed');
  }
  if (parsed.username || parsed.password) {
    throw new SsrfFetchError('URL credentials are not allowed');
  }
  if (!parsed.hostname || parsed.hostname === 'localhost') {
    throw new SsrfFetchError('Host is not allowed');
  }
  if (netIsIpLiteral(parsed.hostname) && isBlockedIpAddress(parsed.hostname)) {
    throw new SsrfFetchError('Host is not allowed');
  }
  return parsed;
}

function netIsIpLiteral(hostname: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(':');
}

async function cancelBody(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    /* ignore */
  }
}

/**
 * Fetch public HTTPS URL with redirect + private-IP guards (no host allowlist).
 */
export async function ssrfSafePublicFetchBytes(
  urlString: string,
  options: SsrfSafePublicFetchOptions = {}
): Promise<{ buffer: Buffer; finalUrl: string; contentType: string | null }> {
  const timeoutMs = options.timeoutMs ?? LINK_PREVIEW_FETCH_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? LINK_PREVIEW_MAX_REDIRECTS;
  const maxBytes = options.maxBytes ?? LINK_PREVIEW_MAX_BYTES;
  const fetchFn = options.fetchFn ?? fetch;
  const lookupFn: DnsLookupFn =
    options.lookupFn ??
    (async (hostname) => {
      const rows = await dns.lookup(hostname, { all: true });
      return rows.map((r) => ({
        address: r.address,
        family: (r.family === 6 ? 6 : 4) as 4 | 6,
      }));
    });

  const deadline = Date.now() + timeoutMs;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  const assertNotTimedOut = () => {
    if (ac.signal.aborted || Date.now() >= deadline) {
      throw new SsrfFetchError('Fetch timed out');
    }
  };

  try {
    let current = assertPublicHttpsUrl(urlString);
    let redirects = 0;

    while (true) {
      assertNotTimedOut();
      await assertHostnameResolvesPublic(current.hostname, lookupFn);
      assertNotTimedOut();

      let res: Response;
      try {
        res = await fetchFn(current.toString(), {
          method: 'GET',
          redirect: 'manual',
          signal: ac.signal,
          headers: {
            Accept: options.accept ?? 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
            'User-Agent': options.userAgent ?? 'BandejaLinkPreview/1.0',
            'Accept-Language': 'en-US,en;q=0.8',
          },
        });
      } catch (err) {
        if (isAbortError(err)) throw new SsrfFetchError('Fetch timed out');
        throw new SsrfFetchError('Fetch failed');
      }

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        await cancelBody(res);
        if (!loc) throw new SsrfFetchError('Redirect without Location');
        redirects += 1;
        if (redirects > maxRedirects) throw new SsrfFetchError('Too many redirects');
        let next: URL;
        try {
          next = new URL(loc, current);
        } catch {
          throw new SsrfFetchError('Invalid redirect Location');
        }
        current = assertPublicHttpsUrl(next.toString());
        continue;
      }

      if (!res.ok) {
        await cancelBody(res);
        throw new SsrfFetchError(`HTTP ${res.status}`);
      }

      const buffer = await readResponseBodyCapped(res, maxBytes, ac.signal);
      return {
        buffer,
        finalUrl: current.toString(),
        contentType: res.headers.get('content-type'),
      };
    }
  } finally {
    clearTimeout(timer);
  }
}
