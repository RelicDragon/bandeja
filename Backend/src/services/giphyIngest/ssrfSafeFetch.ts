import dns from 'node:dns/promises';
import net from 'node:net';
import { isAllowedGiphyHost } from './giphyHosts';

export const GIPHY_FETCH_TIMEOUT_MS = 8_000;
export const GIPHY_MAX_REDIRECTS = 3;
export const GIPHY_MAX_BYTES = 10 * 1024 * 1024; // align with FE chat image UX cap

export type DnsLookupFn = (
  hostname: string
) => Promise<Array<{ address: string; family: 4 | 6 }>>;

export type SsrfSafeFetchOptions = {
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  fetchFn?: typeof fetch;
  lookupFn?: DnsLookupFn;
};

export class SsrfFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfFetchError';
  }
}

export function isBlockedIpAddress(ip: string): boolean {
  const addr = ip.trim().toLowerCase();
  if (!addr) return true;

  if (net.isIPv4(addr)) {
    const parts = addr.split('.').map((p) => Number(p));
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return true;
    }
    const [a, b] = parts as [number, number, number, number];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 192 && b === 0 && parts[2] === 0) return true; // IETF protocol
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  if (net.isIPv6(addr)) {
    if (addr === '::1' || addr === '::') return true;
    // IPv4-mapped :ffff:x.x.x.x or :ffff:hhhh:hhhh
    const mappedDotted = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mappedDotted?.[1]) return isBlockedIpAddress(mappedDotted[1]);
    const mappedHex = addr.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (mappedHex?.[1] && mappedHex[2]) {
      const hi = parseInt(mappedHex[1], 16);
      const lo = parseInt(mappedHex[2], 16);
      if (!Number.isFinite(hi) || !Number.isFinite(lo)) return true;
      const v4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
      return isBlockedIpAddress(v4);
    }
    const normalized = addr.replace(/^\[|\]$/g, '');
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    if (
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    ) {
      return true;
    }
    return false;
  }

  return true;
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name;
  return name === 'AbortError' || name === 'TimeoutError';
}

async function assertHostnameResolvesPublic(
  hostname: string,
  lookupFn: DnsLookupFn,
  signal: AbortSignal
): Promise<void> {
  let results: Array<{ address: string; family: 4 | 6 }>;
  try {
    results = await new Promise<Array<{ address: string; family: 4 | 6 }>>(
      (resolve, reject) => {
        const onAbort = () => reject(new SsrfFetchError('Fetch timed out'));
        signal.addEventListener('abort', onAbort, { once: true });
        void lookupFn(hostname).then(
          (rows) => {
            signal.removeEventListener('abort', onAbort);
            if (signal.aborted) reject(new SsrfFetchError('Fetch timed out'));
            else resolve(rows);
          },
          () => {
            signal.removeEventListener('abort', onAbort);
            reject(new SsrfFetchError('DNS lookup failed'));
          }
        );
      }
    );
  } catch {
    if (signal.aborted) throw new SsrfFetchError('Fetch timed out');
    throw new SsrfFetchError('DNS lookup failed');
  }
  if (!results.length) {
    throw new SsrfFetchError('DNS lookup failed');
  }
  for (const result of results) {
    if (isBlockedIpAddress(result.address)) {
      throw new SsrfFetchError('Resolved IP is not allowed');
    }
  }
}

function assertHttpsAllowlistedUrl(urlString: string): URL {
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
  if (parsed.port && parsed.port !== '443') {
    throw new SsrfFetchError('Only the default HTTPS port is allowed');
  }
  if (!isAllowedGiphyHost(parsed.hostname)) {
    throw new SsrfFetchError('Host is not allowlisted');
  }
  return parsed;
}

async function cancelBody(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    /* ignore */
  }
}

/**
 * Read response body with a hard byte cap (streaming). Prevents OOM when Content-Length is absent/lied.
 */
export async function readResponseBodyCapped(
  res: Response,
  maxBytes: number,
  signal?: AbortSignal
): Promise<Buffer> {
  if (signal?.aborted) {
    await cancelBody(res);
    throw new SsrfFetchError('Fetch timed out');
  }

  const contentLength = res.headers.get('content-length');
  if (contentLength) {
    const n = Number(contentLength);
    if (Number.isFinite(n) && n > maxBytes) {
      await cancelBody(res);
      throw new SsrfFetchError('Content too large');
    }
  }

  if (!res.body || typeof res.body.getReader !== 'function') {
    const ab = await res.arrayBuffer();
    if (ab.byteLength > maxBytes) {
      throw new SsrfFetchError('Content too large');
    }
    return Buffer.from(ab);
  }

  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  const onAbort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    while (true) {
      if (signal?.aborted) {
        throw new SsrfFetchError('Fetch timed out');
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new SsrfFetchError('Content too large');
      }
      chunks.push(Buffer.from(value));
    }
  } catch (err) {
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
    if (err instanceof SsrfFetchError) throw err;
    if (isAbortError(err)) throw new SsrfFetchError('Fetch timed out');
    throw new SsrfFetchError('Fetch failed');
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }

  return chunks.length === 1 ? chunks[0]! : Buffer.concat(chunks, total);
}

/**
 * Fetch bytes from an allowlisted Giphy HTTPS URL with redirect + private-IP guards.
 * Wall-clock timeout covers redirects + body download.
 */
export async function ssrfSafeFetchBytes(
  urlString: string,
  options: SsrfSafeFetchOptions = {}
): Promise<{ buffer: Buffer; finalUrl: string; contentType: string | null }> {
  const timeoutMs = options.timeoutMs ?? GIPHY_FETCH_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? GIPHY_MAX_REDIRECTS;
  const maxBytes = options.maxBytes ?? GIPHY_MAX_BYTES;
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
    let current = assertHttpsAllowlistedUrl(urlString);
    let redirects = 0;

    while (true) {
      assertNotTimedOut();
      await assertHostnameResolvesPublic(current.hostname, lookupFn, ac.signal);
      assertNotTimedOut();

      let res: Response;
      try {
        res = await fetchFn(current.toString(), {
          method: 'GET',
          redirect: 'manual',
          signal: ac.signal,
          headers: {
            Accept: 'image/*,application/json,*/*',
            'User-Agent': 'BandejaGiphyIngest/1.0',
          },
        });
      } catch (err) {
        if (isAbortError(err)) {
          throw new SsrfFetchError('Fetch timed out');
        }
        throw new SsrfFetchError('Fetch failed');
      }

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        await cancelBody(res);
        if (!loc) throw new SsrfFetchError('Redirect without Location');
        redirects += 1;
        if (redirects > maxRedirects) {
          throw new SsrfFetchError('Too many redirects');
        }
        let next: URL;
        try {
          next = new URL(loc, current);
        } catch {
          throw new SsrfFetchError('Invalid redirect Location');
        }
        current = assertHttpsAllowlistedUrl(next.toString());
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
