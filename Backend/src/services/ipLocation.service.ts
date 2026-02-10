import { Request } from 'express';
import prisma from '../config/database';
import { SUPPORTED_CURRENCIES, DEFAULT_CURRENCY } from '../utils/constants';

interface IpapiResponse {
  latitude?: number;
  longitude?: number;
  currency?: string;
  [key: string]: unknown;
}

const IPAPI_INTERVAL_MS = 2000;
const ipapiTimestamps: number[] = [];
let ipapiRateLimitPromise = Promise.resolve();

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
  return fetchExternalIp();
}

export type LocationByIp = { latitude: number; longitude: number; currency: string };

export async function getLocationByIp(ip: string): Promise<LocationByIp | null> {
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
  }

  ipapiRateLimitPromise = ipapiRateLimitPromise.then(() => waitIpapiRateLimit());
  await ipapiRateLimitPromise;
  const url = `https://ipapi.co/${encodeURIComponent(ip)}/json/`;
  const fetchWithTimeout = (timeoutMs: number) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    return fetch(url, { signal: ac.signal }).finally(() => clearTimeout(t));
  };
  const timeoutMs = 10_000;
  let res: Response;
  try {
    res = await fetchWithTimeout(timeoutMs);
  } catch {
    try {
      res = await fetchWithTimeout(timeoutMs);
    } catch {
      return null;
    }
  }
  if (!res.ok) return null;
  const body = (await res.json()) as IpapiResponse;
  const lat = body?.latitude;
  const lon = body?.longitude;
  if (lat == null || lon == null || typeof lat !== 'number' || typeof lon !== 'number') return null;
  const rawCurrency = (body.currency && typeof body.currency === 'string' ? body.currency : DEFAULT_CURRENCY).toUpperCase();
  const currency = SUPPORTED_CURRENCIES.includes(rawCurrency as any) ? rawCurrency : DEFAULT_CURRENCY;
  await prisma.ipLocationCache.upsert({
    where: { ip },
    create: { ip, latitude: lat, longitude: lon, meta: body as object },
    update: { latitude: lat, longitude: lon, meta: body as object, createdAt: new Date() },
  });
  return { latitude: lat, longitude: lon, currency };
}

export async function updateUserIpLocation(userId: string, ip: string): Promise<void> {
  if (isLocalIp(ip)) return;
  const loc = await getLocationByIp(ip);

  // Check if user has manual currency setting (not "auto")
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
