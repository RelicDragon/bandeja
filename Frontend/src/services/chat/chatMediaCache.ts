import { resolveChatMediaUrl } from '@/components/audio/audioWaveformUtils';
import { logChatMediaCacheQuota } from '@/services/chat/chatDiagnostics';

const CACHE_NAME = 'bandeja-chat-media-v1';
const MAX_TRACKED_KEYS = 140;
const trackedKeys: string[] = [];

function touchTrackedCacheKey(cacheKey: string): void {
  const i = trackedKeys.indexOf(cacheKey);
  if (i >= 0) trackedKeys.splice(i, 1);
  trackedKeys.push(cacheKey);
  while (trackedKeys.length > MAX_TRACKED_KEYS) {
    const old = trackedKeys.shift();
    if (old) void evictChatMediaCacheKey(old);
  }
}

async function evictChatMediaCacheKey(cacheKey: string): Promise<void> {
  if (!cacheKey || cacheKey.startsWith('blob:') || cacheKey.startsWith('data:')) return;
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.delete(cacheKey);
  } catch {
    /* noop */
  }
}

export function mediaCacheKeyForSrc(src: string): string {
  if (!src || src.startsWith('blob:') || src.startsWith('data:')) return src;
  return resolveChatMediaUrl(src);
}

export async function readCachedMediaResponse(cacheKey: string): Promise<Response | undefined> {
  if (!cacheKey || cacheKey.startsWith('blob:') || cacheKey.startsWith('data:')) return undefined;
  if (!('caches' in window)) return undefined;
  try {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match(cacheKey)) ?? undefined;
  } catch {
    return undefined;
  }
}

export async function writeCachedMediaResponse(cacheKey: string, response: Response): Promise<void> {
  if (!cacheKey || cacheKey.startsWith('blob:') || cacheKey.startsWith('data:')) return;
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(cacheKey, response.clone());
    touchTrackedCacheKey(cacheKey);
  } catch (e) {
    const name = e instanceof DOMException ? e.name : '';
    const msg = e instanceof Error ? e.message : String(e);
    if (name === 'QuotaExceededError' || msg.includes('QuotaExceeded') || msg.includes('quota')) {
      logChatMediaCacheQuota(cacheKey);
    }
  }
}
