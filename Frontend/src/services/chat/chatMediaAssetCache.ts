import {
  mediaCacheKeyForSrc,
  readCachedMediaResponse,
  writeCachedMediaResponse,
} from './chatMediaCache';

export type ChatMediaDimensions = {
  width: number;
  height: number;
};

export type ChatMediaAsset = {
  displayUrl: string;
  dimensions: ChatMediaDimensions | null;
};

type CacheEntry = {
  displayUrl: string | null;
  dimensions: ChatMediaDimensions | null;
  promise: Promise<ChatMediaAsset> | null;
  references: number;
  lastUsed: number;
};

const MAX_OBJECT_URLS = 140;
const entries = new Map<string, CacheEntry>();

function isLocalUrl(src: string): boolean {
  return src.startsWith('blob:') || src.startsWith('data:');
}

function touch(entry: CacheEntry): void {
  entry.lastUsed = Date.now();
}

function trimUnusedEntries(): void {
  const objectUrlEntries = [...entries.entries()]
    .filter(([, entry]) => entry.displayUrl?.startsWith('blob:'))
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  let excess = objectUrlEntries.length - MAX_OBJECT_URLS;
  if (excess <= 0) return;

  for (const [key, entry] of objectUrlEntries) {
    if (excess <= 0) break;
    if (entry.references > 0 || !entry.displayUrl) continue;
    URL.revokeObjectURL(entry.displayUrl);
    entries.delete(key);
    excess -= 1;
  }
}

async function readImageDimensions(displayUrl: string): Promise<ChatMediaDimensions | null> {
  if (typeof Image === 'undefined') return null;
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      resolve(
        image.naturalWidth > 0 && image.naturalHeight > 0
          ? { width: image.naturalWidth, height: image.naturalHeight }
          : null
      );
    };
    image.onerror = () => resolve(null);
    image.src = displayUrl;
  });
}

async function loadAsset(cacheKey: string): Promise<ChatMediaAsset> {
  try {
    let response = await readCachedMediaResponse(cacheKey);
    if (!response?.ok) {
      const fetched = await fetch(cacheKey, { mode: 'cors', credentials: 'omit' });
      if (!fetched.ok) return { displayUrl: cacheKey, dimensions: null };
      await writeCachedMediaResponse(cacheKey, fetched);
      response = fetched;
    }
    const blob = await response.blob();
    const displayUrl = URL.createObjectURL(blob);
    return {
      displayUrl,
      dimensions: await readImageDimensions(displayUrl),
    };
  } catch {
    return { displayUrl: cacheKey, dimensions: null };
  }
}

export function peekChatMediaAsset(src: string): ChatMediaAsset | null {
  if (!src) return null;
  if (isLocalUrl(src)) return { displayUrl: src, dimensions: null };
  const cacheKey = mediaCacheKeyForSrc(src);
  const entry = entries.get(cacheKey);
  if (!entry) return null;
  if (!entry.displayUrl && entry.dimensions) {
    return { displayUrl: cacheKey, dimensions: entry.dimensions };
  }
  if (!entry.displayUrl) return null;
  touch(entry);
  return { displayUrl: entry.displayUrl, dimensions: entry.dimensions };
}

export function primeChatMediaDimensions(
  src: string,
  dimensions: ChatMediaDimensions
): void {
  if (!src || isLocalUrl(src) || dimensions.width <= 0 || dimensions.height <= 0) return;
  const cacheKey = mediaCacheKeyForSrc(src);
  const entry = entries.get(cacheKey);
  if (entry) {
    entry.dimensions = dimensions;
    touch(entry);
    return;
  }
  entries.set(cacheKey, {
    displayUrl: null,
    dimensions,
    promise: null,
    references: 0,
    lastUsed: Date.now(),
  });
}

export async function acquireChatMediaAsset(src: string): Promise<ChatMediaAsset> {
  if (!src || isLocalUrl(src)) {
    return { displayUrl: src, dimensions: null };
  }

  const cacheKey = mediaCacheKeyForSrc(src);
  let entry = entries.get(cacheKey);
  if (!entry) {
    entry = {
      displayUrl: null,
      dimensions: null,
      promise: null,
      references: 0,
      lastUsed: Date.now(),
    };
    entries.set(cacheKey, entry);
  }

  entry.references += 1;
  touch(entry);
  if (!entry.displayUrl) {
    entry.promise ??= loadAsset(cacheKey);
    const loaded = await entry.promise;
    entry.displayUrl = loaded.displayUrl;
    entry.dimensions ??= loaded.dimensions;
    entry.promise = null;
    trimUnusedEntries();
  }

  return { displayUrl: entry.displayUrl, dimensions: entry.dimensions };
}

export function releaseChatMediaAsset(src: string): void {
  if (!src || isLocalUrl(src)) return;
  const entry = entries.get(mediaCacheKeyForSrc(src));
  if (!entry) return;
  entry.references = Math.max(0, entry.references - 1);
  touch(entry);
  trimUnusedEntries();
}

export function recordChatMediaDimensions(
  src: string,
  dimensions: ChatMediaDimensions
): void {
  if (!src || isLocalUrl(src) || dimensions.width <= 0 || dimensions.height <= 0) return;
  const entry = entries.get(mediaCacheKeyForSrc(src));
  if (!entry) return;
  entry.dimensions = dimensions;
  touch(entry);
}

export function clearChatMediaAssetMemoryCache(): void {
  for (const entry of entries.values()) {
    if (entry.displayUrl?.startsWith('blob:')) URL.revokeObjectURL(entry.displayUrl);
  }
  entries.clear();
}
