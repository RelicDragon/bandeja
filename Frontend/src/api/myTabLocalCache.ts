import type { Game, Invite, UserTeam } from '@/types';

export interface MyTabData {
  games: Game[];
  invites: Invite[];
  teams: UserTeam[];
  unreadCounts: Record<string, number>;
  storiesCount?: number | null;
  booktimeConnected?: boolean | null;
  _meta?: {
    etag?: string;
    userId?: string;
    timestamp: string;
  };
}

const LEGACY_ETAG_KEY = 'my_tab_etag';
const LEGACY_DATA_KEY = 'my_tab_data';
const LEGACY_TIMESTAMP_KEY = 'my_tab_timestamp';

const ETAG_PREFIX = 'my_tab_etag:';
const DATA_PREFIX = 'my_tab_data:';
const TIMESTAMP_PREFIX = 'my_tab_timestamp:';

export type StoredMyTabData = MyTabData & {
  _meta?: MyTabData['_meta'] & { userId?: string };
};

function getStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

export function myTabCacheKeys(userId: string) {
  return {
    etag: `${ETAG_PREFIX}${userId}`,
    data: `${DATA_PREFIX}${userId}`,
    timestamp: `${TIMESTAMP_PREFIX}${userId}`,
  };
}

export function resolveMyTabCacheUserId(): string | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem('user');
    if (!raw) return null;
    const user = JSON.parse(raw) as { id?: string };
    return user.id ?? null;
  } catch {
    return null;
  }
}

export function isMyTabCacheOwnedByUser(data: StoredMyTabData, userId: string): boolean {
  return data._meta?.userId === userId;
}

export function readMyTabLocalCache(userId: string): {
  etag: string | null;
  data: StoredMyTabData | null;
  timestampMs: number | null;
} {
  const storage = getStorage();
  if (!storage) {
    return { etag: null, data: null, timestampMs: null };
  }

  const keys = myTabCacheKeys(userId);
  const etag = storage.getItem(keys.etag);
  const rawData = storage.getItem(keys.data);
  const rawTimestamp = storage.getItem(keys.timestamp);

  if (!rawData) {
    return { etag, data: null, timestampMs: null };
  }

  try {
    const data = JSON.parse(rawData) as StoredMyTabData;
    if (!isMyTabCacheOwnedByUser(data, userId)) {
      return { etag, data: null, timestampMs: null };
    }
    const timestampMs = rawTimestamp ? parseInt(rawTimestamp, 10) : null;
    return {
      etag,
      data,
      timestampMs: Number.isFinite(timestampMs) ? timestampMs : null,
    };
  } catch {
    return { etag, data: null, timestampMs: null };
  }
}

export function writeMyTabLocalCache(userId: string, data: MyTabData, etag: string): void {
  const storage = getStorage();
  if (!storage || !etag) return;

  const keys = myTabCacheKeys(userId);
  const stored: StoredMyTabData = {
    ...data,
    _meta: {
      ...data._meta,
      userId,
      etag,
      timestamp: data._meta?.timestamp ?? new Date().toISOString(),
    },
  };

  storage.setItem(keys.etag, etag);
  storage.setItem(keys.data, JSON.stringify(stored));
  storage.setItem(keys.timestamp, Date.now().toString());
  clearLegacyMyTabLocalCache();
}

export function clearLegacyMyTabLocalCache(): void {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(LEGACY_ETAG_KEY);
  storage.removeItem(LEGACY_DATA_KEY);
  storage.removeItem(LEGACY_TIMESTAMP_KEY);
}

export function clearMyTabLocalCache(userId: string): void {
  const storage = getStorage();
  if (!storage) return;
  const keys = myTabCacheKeys(userId);
  storage.removeItem(keys.etag);
  storage.removeItem(keys.data);
  storage.removeItem(keys.timestamp);
}

export function clearAllMyTabLocalCaches(): void {
  const storage = getStorage();
  if (!storage) return;

  clearLegacyMyTabLocalCache();

  const keysToRemove: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key) continue;
    if (
      key.startsWith(ETAG_PREFIX) ||
      key.startsWith(DATA_PREFIX) ||
      key.startsWith(TIMESTAMP_PREFIX)
    ) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    storage.removeItem(key);
  }
}

export function clearMyTabCachesExcept(keepUserId: string): void {
  const storage = getStorage();
  if (!storage) return;

  clearLegacyMyTabLocalCache();

  const keysToRemove: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key) continue;
    const isScoped =
      key.startsWith(ETAG_PREFIX) ||
      key.startsWith(DATA_PREFIX) ||
      key.startsWith(TIMESTAMP_PREFIX);
    if (!isScoped) continue;
    const suffix = key.split(':').slice(1).join(':');
    if (suffix && suffix !== keepUserId) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    storage.removeItem(key);
  }
}

export function isMyTabLocalCacheFresh(timestampMs: number | null, maxAgeMs: number): boolean {
  if (timestampMs == null) return false;
  return Date.now() - timestampMs < maxAgeMs;
}
