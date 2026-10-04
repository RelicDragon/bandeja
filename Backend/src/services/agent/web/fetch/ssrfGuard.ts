/**
 * SSRF guard for `web_fetch` (port of travel-bandeja `webFetch/ssrfGuard.js`, tightened).
 *
 * `checkUrlShape` enforces the no-network rules (scheme, userinfo, default ports, no IP
 * literals, no internal / single-label names, refused domains). `resolveHostSafety`
 * resolves the name and requires EVERY address to be public; the fetch layer then pins
 * the TCP connect to exactly those addresses (`pinnedDispatcher.ts`), so a second DNS
 * answer can't rebind to the LAN or cloud metadata. DNS errors fail closed.
 *
 * Pure apart from the default resolver, which is injectable.
 */
import dns from 'node:dns/promises';
import { isIPv4, isIPv6 } from 'node:net';

export type PinnedAddress = { address: string; family: 4 | 6 };
export type DnsLookup = (host: string) => Promise<PinnedAddress[]>;

export type UrlShapeRefusal =
  | 'scheme'
  | 'userinfo'
  | 'port'
  | 'ip_literal'
  | 'localhost'
  | 'single_label'
  | 'internal_suffix'
  | 'refused_domain';

const BLOCKED_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.localdomain',
  '.internal',
  '.lan',
  '.home',
  '.box',
  '.arpa',
  '.example',
  '.invalid',
  '.test',
  '.svc',
  '.corp',
  '.intranet',
  '.private',
];

/**
 * Domains the backend must not fetch even when a search returns them (D12): booking
 * providers (the server never talks to them; see the `*NoOutboundHttp` tests) and our own
 * app hosts. Matched on the domain and every subdomain.
 */
export const REFUSED_FETCH_DOMAINS: readonly string[] = [
  'booktime.rs',
  'padeloo.app',
  'klikteren.com',
  'weltner.site',
  'bandeja.me',
];

const IPV4_BLOCKED_CIDRS = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.0.0.0/24',
  '192.0.2.0/24',
  '192.88.99.0/24',
  '192.168.0.0/16',
  '198.18.0.0/15',
  '198.51.100.0/24',
  '203.0.113.0/24',
  '224.0.0.0/4',
  '240.0.0.0/4',
];

function ipv4ToInt(ip: string): number | null {
  const parts = String(ip).split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const octet = Number(p);
    if (octet > 255) return null;
    n = n * 256 + octet;
  }
  return n >>> 0;
}

const IPV4_BLOCKED_RANGES: [number, number][] = IPV4_BLOCKED_CIDRS.map((cidr) => {
  const [ip, bits] = cidr.split('/');
  const start = ipv4ToInt(ip) ?? 0;
  return [start, start + 2 ** (32 - Number(bits)) - 1];
});

function isBlockedIpv4Int(n: number): boolean {
  return IPV4_BLOCKED_RANGES.some(([s, e]) => n >= s && n <= e);
}

/** Eight 16-bit groups, handling `::` and dotted IPv4 tails; null when malformed. */
function expandIpv6(input: string): number[] | null {
  let ip = String(input).toLowerCase().trim().replace(/^\[|\]$/g, '');
  const zone = ip.indexOf('%');
  if (zone !== -1) ip = ip.slice(0, zone);
  let tail: string[] = [];
  if (ip.includes('.')) {
    const lastColon = ip.lastIndexOf(':');
    if (lastColon === -1) return null;
    const v4 = ipv4ToInt(ip.slice(lastColon + 1));
    if (v4 == null) return null;
    tail = [((v4 >>> 16) & 0xffff).toString(16), (v4 & 0xffff).toString(16)];
    // Keep the trailing colon: empty groups are filtered below, `::` stays intact.
    ip = ip.slice(0, lastColon + 1);
  }
  const halves = ip.split('::');
  let groups: string[];
  if (halves.length === 2) {
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves[1] ? halves[1].split(':').filter((g) => g !== '') : [];
    const fill = 8 - left.length - right.length - tail.length;
    if (fill < 0) return null;
    groups = [...left, ...new Array<string>(fill).fill('0'), ...right, ...tail];
  } else if (halves.length === 1) {
    groups = [...ip.split(':').filter((g) => g !== ''), ...tail];
  } else {
    return null;
  }
  if (groups.length !== 8) return null;
  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out;
}

function v4FromGroups(hi: number, lo: number): number {
  return ((hi << 16) | lo) >>> 0;
}

function isBlockedIpv6(ip: string): boolean {
  const g = expandIpv6(ip);
  if (!g) return true; // unparseable → blocked
  const zeroUntil = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (g.every((x) => x === 0)) return true; // ::
  if (zeroUntil(7) && g[7] === 1) return true; // ::1
  // IPv4-mapped ::ffff:a.b.c.d and IPv4-compatible ::a.b.c.d
  if (zeroUntil(5) && g[5] === 0xffff) return isBlockedIpv4Int(v4FromGroups(g[6], g[7]));
  if (zeroUntil(6)) return isBlockedIpv4Int(v4FromGroups(g[6], g[7]));
  // NAT64 64:ff9b::/96 (and the local-use 64:ff9b:1::/48): check the embedded IPv4.
  if (g[0] === 0x64 && g[1] === 0xff9b) return g[2] === 1 || isBlockedIpv4Int(v4FromGroups(g[6], g[7]));
  // 6to4 2002:AABB:CCDD::/48 embeds AA.BB.CC.DD.
  if (g[0] === 0x2002) return isBlockedIpv4Int(v4FromGroups(g[1], g[2]));
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo
  if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true; // discard-only
  return (
    (g[0] & 0xff00) === 0xff00 || // multicast ff00::/8
    (g[0] & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (g[0] & 0xffc0) === 0xfec0 || // site-local fec0::/10
    (g[0] & 0xfe00) === 0xfc00 // unique-local fc00::/7
  );
}

/** True for any non-public IP literal (v4 or v6); anything unparseable is blocked. */
export function isBlockedIp(ip: string): boolean {
  const cleaned = String(ip ?? '').trim().replace(/^\[|\]$/g, '');
  if (isIPv4(cleaned)) {
    const n = ipv4ToInt(cleaned);
    return n == null || isBlockedIpv4Int(n);
  }
  if (isIPv6(cleaned) || cleaned.includes(':')) return isBlockedIpv6(cleaned);
  return true;
}

export function normalizeHost(host: string): string {
  return String(host ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.+$/, '');
}

function isIpLiteral(host: string): boolean {
  // `new URL` already turns decimal / octal / hex IPv4 forms into dotted quads.
  return isIPv4(host) || isIPv6(host) || /^[0-9.]+$/.test(host) || host.includes(':');
}

export function isRefusedDomain(host: string, extra: readonly string[] = []): boolean {
  const h = normalizeHost(host);
  return [...REFUSED_FETCH_DOMAINS, ...extra].some((d) => {
    const domain = normalizeHost(d);
    return Boolean(domain) && (h === domain || h.endsWith(`.${domain}`));
  });
}

/** Our own frontend host from env (e.g. a staging domain), refused like `bandeja.me`. */
export function ownAppHosts(env: NodeJS.ProcessEnv = process.env): string[] {
  const out: string[] = [];
  for (const raw of [env.FRONTEND_URL, env.BACKEND_URL, env.PUBLIC_API_URL]) {
    try {
      if (raw) out.push(new URL(raw).hostname);
    } catch {
      /* not a URL */
    }
  }
  return out;
}

/** No-network rules for one URL (the start URL and every redirect hop). */
export function checkUrlShape(url: URL, extraRefusedDomains: readonly string[] = ownAppHosts()): UrlShapeRefusal | null {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'scheme';
  if (url.username || url.password) return 'userinfo';
  // `URL.port` is '' for the scheme's default port (an explicit :443 on https is dropped).
  if (url.port !== '') return 'port';
  const host = normalizeHost(url.hostname);
  if (!host) return 'single_label';
  if (isIpLiteral(host)) return 'ip_literal';
  if (host === 'localhost') return 'localhost';
  if (!host.includes('.')) return 'single_label';
  if (BLOCKED_HOST_SUFFIXES.some((sfx) => host.endsWith(sfx))) return 'internal_suffix';
  if (isRefusedDomain(host, extraRefusedDomains)) return 'refused_domain';
  return null;
}

async function defaultLookup(host: string): Promise<PinnedAddress[]> {
  const rows = await dns.lookup(host, { all: true, verbatim: true });
  return rows.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
}

const DNS_TIMEOUT_MS = 3_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('DNS timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('DNS lookup failed'));
      },
    );
  });
}

export type HostSafety =
  | { safe: true; addresses: PinnedAddress[] }
  | { safe: false; reason: 'dns_failed' | 'private_address' };

/** Resolve `host`; safe only when it resolves and every address is public. */
export async function resolveHostSafety(host: string, opts: { lookup?: DnsLookup } = {}): Promise<HostSafety> {
  const lookup = opts.lookup ?? defaultLookup;
  let resolved: PinnedAddress[];
  try {
    resolved = await withTimeout(lookup(normalizeHost(host)), DNS_TIMEOUT_MS);
  } catch {
    return { safe: false, reason: 'dns_failed' };
  }
  if (!Array.isArray(resolved) || resolved.length === 0) return { safe: false, reason: 'dns_failed' };
  const addresses: PinnedAddress[] = [];
  for (const entry of resolved) {
    const address = String(entry?.address ?? '').replace(/^\[|\]$/g, '');
    if (!address || isBlockedIp(address)) return { safe: false, reason: 'private_address' };
    addresses.push({ address, family: isIPv6(address) ? 6 : 4 });
  }
  return { safe: true, addresses };
}
