import crypto from 'node:crypto';
import sharp from 'sharp';
import { config } from '../../config/env';
import {
  assertPublicHttpsUrl,
  ssrfSafePublicFetchBytes,
  SsrfFetchError,
} from './ssrfSafePublicFetch';
import { getRedisClient } from '../redis/redisClient';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_INPUT_PIXELS = 24_000_000;
const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 180;
const MAX_DIMENSION = 640;
const TRANSFORM_CACHE_MAX = 200;
const TRANSFORM_CACHE_MAX_BYTES = 32 * 1024 * 1024;
const TRANSFORM_CACHE_ENTRY_MAX_BYTES = 2 * 1024 * 1024;
const REDIS_TRANSFORM_CACHE_MAX = 500;
const REDIS_TRANSFORM_MAX_BYTES = 512 * 1024;
const TRANSFORM_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TRANSFORM_CACHE_TTL_SEC = TRANSFORM_CACHE_TTL_MS / 1000;

type OutputFormat = 'webp' | 'avif';
type TransformCacheEntry = {
  at: number;
  buffer: Buffer;
  contentType: string;
  etag: string;
};

const transformCache = new Map<string, TransformCacheEntry>();
const transformInFlight = new Map<string, Promise<TransformCacheEntry>>();
let transformCacheBytes = 0;

export function resetLinkPreviewImageCacheForTests(): void {
  transformCache.clear();
  transformInFlight.clear();
  transformCacheBytes = 0;
}

function removeLocalTransform(cacheKey: string): void {
  const existing = transformCache.get(cacheKey);
  if (!existing) return;
  transformCacheBytes -= existing.buffer.byteLength;
  transformCache.delete(cacheKey);
}

function putLocalTransform(cacheKey: string, entry: TransformCacheEntry): void {
  removeLocalTransform(cacheKey);
  if (entry.buffer.byteLength > TRANSFORM_CACHE_ENTRY_MAX_BYTES) return;
  while (
    transformCache.size >= TRANSFORM_CACHE_MAX ||
    transformCacheBytes + entry.buffer.byteLength > TRANSFORM_CACHE_MAX_BYTES
  ) {
    const oldest = transformCache.keys().next().value;
    if (!oldest) break;
    removeLocalTransform(oldest);
  }
  transformCache.set(cacheKey, entry);
  transformCacheBytes += entry.buffer.byteLength;
}

async function readRedisTransform(cacheKey: string): Promise<TransformCacheEntry | null> {
  const redis = await getRedisClient();
  if (!redis) return null;
  try {
    const raw = await redis.get(`pp:link-preview:image:v1:${cacheKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      buffer?: string;
      contentType?: string;
      etag?: string;
    };
    if (!parsed.buffer || !parsed.contentType || !parsed.etag) return null;
    return {
      at: Date.now(),
      buffer: Buffer.from(parsed.buffer, 'base64'),
      contentType: parsed.contentType,
      etag: parsed.etag,
    };
  } catch {
    return null;
  }
}

async function writeRedisTransform(
  cacheKey: string,
  entry: TransformCacheEntry
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis || entry.buffer.byteLength > REDIS_TRANSFORM_MAX_BYTES) return;
  try {
    const redisKey = `pp:link-preview:image:v1:${cacheKey}`;
    const indexKey = 'pp:link-preview:image:v1:index';
    await redis.set(
      redisKey,
      JSON.stringify({
        buffer: entry.buffer.toString('base64'),
        contentType: entry.contentType,
        etag: entry.etag,
      }),
      { EX: TRANSFORM_CACHE_TTL_SEC }
    );
    await redis.zAdd(indexKey, { score: Date.now(), value: redisKey });
    const count = await redis.zCard(indexKey);
    const overflow =
      count > REDIS_TRANSFORM_CACHE_MAX
        ? await redis.zRange(indexKey, 0, count - REDIS_TRANSFORM_CACHE_MAX - 1)
        : [];
    if (overflow.length > 0) {
      await redis.del(overflow);
      await redis.zRem(indexKey, overflow);
    }
    await redis.expire(indexKey, TRANSFORM_CACHE_TTL_SEC);
  } catch {
    // Local cache and CDN remain available when Redis is degraded.
  }
}

function signingSecret(): string {
  return process.env.LINK_PREVIEW_IMAGE_SECRET || config.jwtSecret || 'link-preview-dev';
}

function hmac(payload: string): string {
  return crypto.createHmac('sha256', signingSecret()).update(payload).digest('base64url');
}

function dimensions(width?: number, height?: number): { width: number; height: number } {
  const safe = (value: number | undefined, fallback: number) =>
    Number.isInteger(value) && value! > 0 ? Math.min(value!, MAX_DIMENSION) : fallback;
  return { width: safe(width, DEFAULT_WIDTH), height: safe(height, DEFAULT_HEIGHT) };
}

/** Stable path relative to `/api`; safe for message snapshots and CDN caching. */
export function buildProxiedImagePath(
  imageUrl: string,
  requested?: { width?: number; height?: number }
): string | null {
  let safe: string;
  try {
    safe = assertPublicHttpsUrl(imageUrl).toString();
  } catch {
    return null;
  }
  const { width, height } = dimensions(requested?.width, requested?.height);
  const sig = hmac(`${width}.${height}.${safe}`);
  const params = new URLSearchParams({
    url: safe,
    w: String(width),
    h: String(height),
    sig,
  });
  return `/link-preview/image?${params.toString()}`;
}

export function verifyProxiedImageParams(params: {
  url?: string;
  w?: string;
  h?: string;
  sig?: string;
}): { url: string; width: number; height: number } {
  const url = typeof params.url === 'string' ? params.url.trim() : '';
  const sig = typeof params.sig === 'string' ? params.sig.trim() : '';
  const requestedWidth = Number(params.w);
  const requestedHeight = Number(params.h);
  if (!url || !sig) throw new SsrfFetchError('Invalid proxy params');
  const { width, height } = dimensions(requestedWidth, requestedHeight);

  const expected = hmac(`${width}.${height}.${url}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new SsrfFetchError('Invalid proxy signature');
  }

  return { url: assertPublicHttpsUrl(url).toString(), width, height };
}

export async function fetchProxiedImageBytes(
  imageUrl: string,
  options?: {
    fetchFn?: typeof fetch;
    width?: number;
    height?: number;
    accept?: string;
  }
): Promise<{ buffer: Buffer; contentType: string; etag: string }> {
  const { width, height } = dimensions(options?.width, options?.height);
  const format: OutputFormat = options?.accept?.includes('image/avif') ? 'avif' : 'webp';
  const cacheKey = crypto
    .createHash('sha256')
    .update(`${imageUrl}\0${width}\0${height}\0${format}`)
    .digest('base64url');
  const cached = transformCache.get(cacheKey);
  if (cached && Date.now() - cached.at <= TRANSFORM_CACHE_TTL_MS) return cached;
  if (cached) removeLocalTransform(cacheKey);
  const existing = transformInFlight.get(cacheKey);
  if (existing) return existing;

  const pending = (async (): Promise<TransformCacheEntry> => {
    const distributed = await readRedisTransform(cacheKey);
    if (distributed) {
      putLocalTransform(cacheKey, distributed);
      return distributed;
    }

    const { buffer, contentType } = await ssrfSafePublicFetchBytes(imageUrl, {
      timeoutMs: 5_000,
      maxBytes: MAX_IMAGE_BYTES,
      fetchFn: options?.fetchFn,
      accept: 'image/*,*/*;q=0.8',
    });
    const sourceType = (contentType ?? '').toLowerCase();
    if (sourceType && !sourceType.startsWith('image/')) {
      throw new SsrfFetchError('Not an image');
    }
    try {
      const pipeline = sharp(buffer, {
        animated: false,
        failOn: 'warning',
        limitInputPixels: MAX_INPUT_PIXELS,
      })
        .rotate()
        .resize(width, height, { fit: 'cover', withoutEnlargement: true });
      const output =
        format === 'avif'
          ? await pipeline.avif({ quality: 55, effort: 4 }).toBuffer()
          : await pipeline.webp({ quality: 78, effort: 4 }).toBuffer();
      const entry: TransformCacheEntry = {
        at: Date.now(),
        buffer: output,
        contentType: `image/${format}`,
        etag: `"${crypto.createHash('sha256').update(output).digest('base64url')}"`,
      };
      putLocalTransform(cacheKey, entry);
      await writeRedisTransform(cacheKey, entry);
      return entry;
    } catch (error) {
      if (error instanceof SsrfFetchError) throw error;
      throw new SsrfFetchError('Invalid or oversized image');
    }
  })().finally(() => {
    transformInFlight.delete(cacheKey);
  });
  transformInFlight.set(cacheKey, pending);
  return pending;
}
