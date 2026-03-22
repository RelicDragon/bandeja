import { Request } from 'express';
import prisma from '../config/database';
import { SUPPORTED_CURRENCIES, DEFAULT_CURRENCY } from '../utils/constants';
import { IP_GEO_PROVIDER_CHAIN, IpGeoProvider } from '../utils/ipGeoProvider';

interface IpapiResponse {
  latitude?: number;
  longitude?: number;
  currency?: string;
  [key: string]: unknown;
}

interface IpwhoisResponse {
  success?: boolean;
  latitude?: number;
  longitude?: number;
  currency_code?: string;
  message?: string;
}

interface IpinfoResponse {
  loc?: string;
  country?: string;
  [key: string]: unknown;
}

const IPAPI_INTERVAL_MS = 2000;
const ipapiTimestamps: number[] = [];
let ipapiRateLimitPromise = Promise.resolve();

let geoProviderRoundRobin = 0;

export class AllIpGeoProvidersFailedError extends Error {
  readonly ipMasked: string;

  constructor(ipMasked: string) {
    super(`[ipLocation] all geo providers failed for ${ipMasked}`);
    this.name = 'AllIpGeoProvidersFailedError';
    this.ipMasked = ipMasked;
  }
}

function maskIpForLog(ip: string): string {
  const t = ip.trim();
  if (t.includes('.')) {
    const p = t.split('.');
    if (p.length === 4) return `${p[0]}.${p[1]}.*.*`;
  }
  if (t.includes(':')) return `[ipv6:${t.length}chars]`;
  return '[ip]';
}

async function waitIpapiRateLimit(): Promise<void> {
  let now = Date.now();
  const prune = () => {
    now = Date.now();
    ipapiTimestamps.splice(0, ipapiTimestamps.length, ...ipapiTimestamps.filter((t) => now - t < IPAPI_INTERVAL_MS));
  };
  prune();
  while (ipapiTimestamps.length >= 1) {
    const waitMs = ipapiTimestamps[0] + IPAPI_INTERVAL_MS - now;
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
    prune();
  }
  ipapiTimestamps.push(Date.now());
}

function isLocalIp(ip: string): boolean {
  if (!ip) return true;
  const trimmed = ip.trim().toLowerCase();
  if (trimmed === '127.0.0.1' || trimmed === '::1' || trimmed === 'localhost') return true;
  if (trimmed.startsWith('10.')) return true;
  if (trimmed.startsWith('172.')) {
    const second = parseInt(trimmed.split('.')[1] ?? '', 10);
    if (second >= 16 && second <= 31) return true;
  }
  if (trimmed.startsWith('192.168.')) return true;
  if (trimmed.startsWith('169.254.')) return true;
  if (trimmed.startsWith('fe80:') || trimmed.startsWith('fe8') || trimmed.startsWith('fe9') || trimmed.startsWith('fea') || trimmed.startsWith('feb')) return true;
  if (trimmed.startsWith('fc') || trimmed.startsWith('fd')) return true;
  return false;
}

async function fetchExternalIp(): Promise<string | null> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 5000);
    const res = await fetch('https://api.ipify.org', { signal: ac.signal }).finally(() =>
      clearTimeout(t),
    );
    if (!res.ok) return null;
    const ip = (await res.text()).trim();
    return ip && !isLocalIp(ip) ? ip : null;
  } catch {
    return null;
  }
}

export async function getClientIp(req: Request): Promise<string | null> {
  let ip: string | null = null;
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const first = forwarded.split(',')[0]?.trim();
    if (first) ip = first;
  }
  if (!ip && typeof req.headers['x-real-ip'] === 'string' && req.headers['x-real-ip'])
    ip = req.headers['x-real-ip'];
  if (!ip) ip = req.ip ?? null;
  if (ip && !isLocalIp(ip)) return ip;
  const hint = ip ? maskIpForLog(ip) : null;
  const external = await fetchExternalIp();
  if (!external) {
    console.warn('[ipLocation] getClientIp: no usable IP', {
      hadDirectIp: Boolean(ip),
      directWasLocal: Boolean(ip && isLocalIp(ip)),
      directMasked: hint,
    });
  }
  return external;
}

export type LocationByIp = { latitude: number; longitude: number; currency: string };

/** Single attempt per provider keeps worst-case IP geo ~3× this value (no API tokens). */
const GEO_FETCH_TIMEOUT_MS = 5_000;

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  return fetch(url, { signal: ac.signal }).finally(() => clearTimeout(t));
}

async function fetchGeoOnce(url: string, ipTag: string, providerLabel: string): Promise<Response | null> {
  try {
    return await fetchWithTimeout(url, GEO_FETCH_TIMEOUT_MS);
  } catch (err) {
    console.warn(`[ipLocation] ${providerLabel} fetch failed`, { ip: ipTag, err: String(err) });
    return null;
  }
}

async function readGeoJson<T>(res: Response, ipTag: string, providerLabel: string): Promise<T | null> {
  try {
    const text = await res.text();
    if (!text?.trim()) {
      console.warn('[ipLocation] empty response body', { ip: ipTag, provider: providerLabel });
      return null;
    }
    return JSON.parse(text) as T;
  } catch (err) {
    console.warn('[ipLocation] invalid JSON from provider', { ip: ipTag, provider: providerLabel, err: String(err) });
    return null;
  }
}

function normalizeCurrencyCode(raw: string | undefined): string {
  const code = (raw && typeof raw === 'string' ? raw : DEFAULT_CURRENCY).toUpperCase();
  return SUPPORTED_CURRENCIES.includes(code as (typeof SUPPORTED_CURRENCIES)[number]) ? code : DEFAULT_CURRENCY;
}

const EUR_ZONE_ISO2 = new Set(
  'AD AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK MC SM VA'.split(' '),
);

function currencyFromCountryIso2(country: string | undefined): string {
  if (!country || country.length !== 2) return DEFAULT_CURRENCY;
  const c = country.toUpperCase();
  if (EUR_ZONE_ISO2.has(c)) return 'EUR';
  const map: Record<string, string> = {
    US: 'USD',
    GB: 'GBP',
    CA: 'CAD',
    AU: 'AUD',
    NZ: 'NZD',
    JP: 'JPY',
    CN: 'CNY',
    CH: 'CHF',
    SE: 'SEK',
    NO: 'NOK',
    DK: 'DKK',
    PL: 'PLN',
    CZ: 'CZK',
    HU: 'HUF',
    RO: 'RON',
    BG: 'BGN',
    IN: 'INR',
    BR: 'BRL',
    MX: 'MXN',
    RU: 'RUB',
    RS: 'RSD',
    TR: 'TRY',
    SG: 'SGD',
    HK: 'HKD',
    KR: 'KRW',
    TH: 'THB',
    MY: 'MYR',
    ID: 'IDR',
    PH: 'PHP',
  };
  return normalizeCurrencyCode(map[c]);
}

function parseIpapiJson(body: IpapiResponse & { error?: boolean; reason?: string }, ipTag: string): LocationByIp | null {
  if (body?.error === true) {
    const reason = body.reason ?? 'unknown';
    console.warn('[ipLocation] ipapi error body', { ip: ipTag, reason });
    return null;
  }
  const lat = body?.latitude;
  const lon = body?.longitude;
  if (lat == null || lon == null || typeof lat !== 'number' || typeof lon !== 'number') {
    console.warn('[ipLocation] ipapi missing coordinates', { ip: ipTag, latType: typeof lat, lonType: typeof lon });
    return null;
  }
  const currency = normalizeCurrencyCode(body.currency);
  return { latitude: lat, longitude: lon, currency };
}

function parseIpwhoisJson(body: IpwhoisResponse, ipTag: string): LocationByIp | null {
  if (body.success !== true) {
    console.warn('[ipLocation] ipwhois success=false', { ip: ipTag, message: body.message });
    return null;
  }
  const lat = body.latitude;
  const lon = body.longitude;
  if (lat == null || lon == null || typeof lat !== 'number' || typeof lon !== 'number') {
    console.warn('[ipLocation] ipwhois missing coordinates', { ip: ipTag, latType: typeof lat, lonType: typeof lon });
    return null;
  }
  const currency = normalizeCurrencyCode(body.currency_code);
  return { latitude: lat, longitude: lon, currency };
}

function parseIpinfoJson(body: IpinfoResponse, ipTag: string): LocationByIp | null {
  const loc = body.loc;
  if (typeof loc !== 'string' || !loc.includes(',')) {
    console.warn('[ipLocation] ipinfo missing or invalid loc', { ip: ipTag });
    return null;
  }
  const [a, b] = loc.split(',').map((s) => s.trim());
  const lat = parseFloat(a);
  const lon = parseFloat(b);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    console.warn('[ipLocation] ipinfo loc parse failed', { ip: ipTag, loc });
    return null;
  }
  const currency = currencyFromCountryIso2(body.country);
  return { latitude: lat, longitude: lon, currency };
}

async function fetchLocationFromIpwhois(ip: string, ipTag: string): Promise<{ loc: LocationByIp; meta: object } | null> {
  const url = `https://ipwhois.app/json/${encodeURIComponent(ip)}`;
  const res = await fetchGeoOnce(url, ipTag, 'ipwhois');
  if (!res) return null;
  if (!res.ok) {
    console.warn('[ipLocation] ipwhois non-OK response', { ip: ipTag, status: res.status });
    return null;
  }
  const body = await readGeoJson<IpwhoisResponse>(res, ipTag, 'ipwhois');
  if (!body) return null;
  const loc = parseIpwhoisJson(body, ipTag);
  if (!loc) return null;
  return { loc, meta: body as object };
}

async function fetchLocationFromIpinfo(ip: string, ipTag: string): Promise<{ loc: LocationByIp; meta: object } | null> {
  const url = `https://ipinfo.io/${encodeURIComponent(ip)}/json`;
  const res = await fetchGeoOnce(url, ipTag, 'ipinfo');
  if (!res) return null;
  if (!res.ok) {
    console.warn('[ipLocation] ipinfo non-OK response', { ip: ipTag, status: res.status });
    return null;
  }
  const body = await readGeoJson<IpinfoResponse>(res, ipTag, 'ipinfo');
  if (!body) return null;
  const loc = parseIpinfoJson(body, ipTag);
  if (!loc) return null;
  return { loc, meta: body as object };
}

async function fetchLocationFromIpapi(ip: string, ipTag: string): Promise<{ loc: LocationByIp; meta: object } | null> {
  ipapiRateLimitPromise = ipapiRateLimitPromise.then(() => waitIpapiRateLimit());
  await ipapiRateLimitPromise;
  const url = `https://ipapi.co/${encodeURIComponent(ip)}/json/`;
  const res = await fetchGeoOnce(url, ipTag, 'ipapi');
  if (!res) return null;
  if (!res.ok) {
    console.warn('[ipLocation] ipapi non-OK response', { ip: ipTag, status: res.status });
    return null;
  }
  const body = await readGeoJson<IpapiResponse & { error?: boolean; reason?: string }>(res, ipTag, 'ipapi');
  if (!body) return null;
  const loc = parseIpapiJson(body, ipTag);
  if (!loc) return null;
  return { loc, meta: body as object };
}

async function fetchFromGeoProvider(
  provider: IpGeoProvider,
  ip: string,
  ipTag: string,
): Promise<{ loc: LocationByIp; meta: object } | null> {
  switch (provider) {
    case IpGeoProvider.IpapiCo:
      return fetchLocationFromIpapi(ip, ipTag);
    case IpGeoProvider.IpwhoisApp:
      return fetchLocationFromIpwhois(ip, ipTag);
    case IpGeoProvider.IpinfoIo:
      return fetchLocationFromIpinfo(ip, ipTag);
    default:
      return null;
  }
}

function rotatedProviderOrder(): IpGeoProvider[] {
  const chain = [...IP_GEO_PROVIDER_CHAIN];
  const n = chain.length;
  const start = geoProviderRoundRobin % n;
  geoProviderRoundRobin += 1;
  return [...chain.slice(start), ...chain.slice(0, start)];
}

async function fetchLocationWithRotatingProviders(
  ip: string,
  ipTag: string,
): Promise<{ loc: LocationByIp; meta: object }> {
  const order = rotatedProviderOrder();
  for (const provider of order) {
    const result = await fetchFromGeoProvider(provider, ip, ipTag);
    if (result) return result;
    console.warn('[ipLocation] geo provider failed, trying next', { ip: ipTag, provider });
  }
  console.error('[ipLocation] all geo providers failed', { ip: ipTag, orderTried: order });
  throw new AllIpGeoProvidersFailedError(ipTag);
}

export async function getLocationByIp(ip: string): Promise<LocationByIp> {
  const ipTag = maskIpForLog(ip);
  const cached = await prisma.ipLocationCache.findUnique({
    where: { ip },
  });

  if (cached) {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    if (cached.createdAt > oneYearAgo) {
      const meta = cached.meta as { currency?: string } | null;
      const rawCurrency = (meta?.currency && typeof meta.currency === 'string' ? meta.currency : DEFAULT_CURRENCY).toUpperCase();
      const currency = SUPPORTED_CURRENCIES.includes(rawCurrency as any) ? rawCurrency : DEFAULT_CURRENCY;
      return { latitude: cached.latitude, longitude: cached.longitude, currency };
    }
    console.warn('[ipLocation] cache stale, refetching', { ip: ipTag });
  }

  const { loc, meta } = await fetchLocationWithRotatingProviders(ip, ipTag);
  const metaForCache = { ...(meta as Record<string, unknown>), currency: loc.currency };
  await prisma.ipLocationCache.upsert({
    where: { ip },
    create: { ip, latitude: loc.latitude, longitude: loc.longitude, meta: metaForCache },
    update: { latitude: loc.latitude, longitude: loc.longitude, meta: metaForCache, createdAt: new Date() },
  });
  return loc;
}

export async function updateUserIpLocation(userId: string, ip: string): Promise<void> {
  if (isLocalIp(ip)) return;
  let loc: LocationByIp | null = null;
  try {
    loc = await getLocationByIp(ip);
  } catch (e) {
    if (!(e instanceof AllIpGeoProvidersFailedError)) throw e;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultCurrency: true },
  });

  const shouldUpdateCurrency = !user || user.defaultCurrency === 'auto' || !user.defaultCurrency;

  await prisma.user.update({
    where: { id: userId },
    data: {
      lastUserIP: ip,
      ...(loc && {
        latitudeByIP: loc.latitude,
        longitudeByIP: loc.longitude,
        ...(shouldUpdateCurrency && { defaultCurrency: loc.currency }),
      }),
    },
  });
}
