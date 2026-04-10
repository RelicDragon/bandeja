const TTL_MS = 45_000;
const MAX_ENTRIES = 800;

type Entry = {
  allowed: Set<string>;
  expiresAt: number;
};

const store = new Map<string, Entry>();

function makeKey(messageId: string, viewerUserId: string): string {
  return `${messageId}\0${viewerUserId}`;
}

function evictLruIfNeeded(forKey: string) {
  if (store.size < MAX_ENTRIES || store.has(forKey)) return;
  const first = store.keys().next().value as string | undefined;
  if (first !== undefined) store.delete(first);
}

/**
 * Returns a clone of the allowed id set, or null if missing/expired.
 * Refreshes LRU position on hit.
 */
export function getAllowedSetFromCache(messageId: string, viewerUserId: string): Set<string> | null {
  const k = makeKey(messageId, viewerUserId);
  const e = store.get(k);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    store.delete(k);
    return null;
  }
  store.delete(k);
  store.set(k, e);
  return new Set(e.allowed);
}

export function setAllowedSetCache(messageId: string, viewerUserId: string, allowed: Set<string>) {
  const k = makeKey(messageId, viewerUserId);
  evictLruIfNeeded(k);
  store.delete(k);
  store.set(k, {
    allowed: new Set(allowed),
    expiresAt: Date.now() + TTL_MS,
  });
}

/** Drop all cached entries for this message (any viewer). */
export function invalidateBasicUsersAllowedCacheForMessage(messageId: string) {
  const prefix = `${messageId}\0`;
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
