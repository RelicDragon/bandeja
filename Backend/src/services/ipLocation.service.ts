import { Request } from 'express';
import prisma from '../config/database';
import { config } from '../config/env';

interface AbstractApiResponse {
  location?: { longitude: number; latitude: number };
}

const ABSTRACT_API_MAX_PER_SEC = 2;
const abstractApiTimestamps: number[] = [];
let abstractApiRateLimitPromise = Promise.resolve();

async function waitAbstractApiRateLimit(): Promise<void> {
  let now = Date.now();
  const prune = () => {
    now = Date.now();
    abstractApiTimestamps.splice(0, abstractApiTimestamps.length, ...abstractApiTimestamps.filter((t) => now - t < 1000));
  };
  prune();
  while (abstractApiTimestamps.length >= ABSTRACT_API_MAX_PER_SEC) {
    const waitMs = abstractApiTimestamps[0] + 1000 - now;
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
    prune();
  }
  abstractApiTimestamps.push(Date.now());
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

export async function getLocationByIp(ip: string): Promise<{ latitude: number; longitude: number } | null> {
  const cached = await prisma.ipLocationCache.findUnique({
    where: { ip },
  });
  if (cached) {
    return { latitude: cached.latitude, longitude: cached.longitude };
  }
  if (!config.abstractApi.apiKey) return null;
  abstractApiRateLimitPromise = abstractApiRateLimitPromise.then(() => waitAbstractApiRateLimit());
  await abstractApiRateLimitPromise;
  const url = `https://ip-intelligence.abstractapi.com/v1/?api_key=${config.abstractApi.apiKey}&ip_address=${encodeURIComponent(ip)}`;
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
  const body = (await res.json()) as AbstractApiResponse;
  const loc = body?.location;
  if (loc == null || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') return null;
  await prisma.ipLocationCache.upsert({
    where: { ip },
    create: { ip, latitude: loc.latitude, longitude: loc.longitude, meta: body as object },
    update: { latitude: loc.latitude, longitude: loc.longitude, meta: body as object },
  });
  return { latitude: loc.latitude, longitude: loc.longitude };
}

export async function updateUserIpLocation(userId: string, ip: string): Promise<void> {
  if (isLocalIp(ip)) return;
  const loc = await getLocationByIp(ip);
  await prisma.user.update({
    where: { id: userId },
    data: {
      lastUserIP: ip,
      ...(loc && { latitudeByIP: loc.latitude, longitudeByIP: loc.longitude }),
    },
  });
}
