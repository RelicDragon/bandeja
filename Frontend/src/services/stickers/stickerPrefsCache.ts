import type { UserStickerPrefs } from '@/api/stickers';
import { MAX_STICKER_FAVORITES, MAX_STICKER_RECENT } from '@/utils/stickerPrefsOrder';

const STORAGE_KEY = 'bandeja.stickerPrefs.v1';

type CacheBlob = {
  byUser: Record<string, UserStickerPrefs>;
};

function readBlob(): CacheBlob {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { byUser: {} };
    const parsed = JSON.parse(raw) as CacheBlob;
    if (!parsed || typeof parsed !== 'object' || !parsed.byUser) return { byUser: {} };
    return parsed;
  } catch {
    return { byUser: {} };
  }
}

function writeBlob(blob: CacheBlob): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
  } catch {
    /* quota / private mode */
  }
}

function sanitizePrefs(prefs: UserStickerPrefs): UserStickerPrefs {
  const favorites = Array.isArray(prefs.favorites)
    ? prefs.favorites.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(
        0,
        MAX_STICKER_FAVORITES
      )
    : [];
  const recent = Array.isArray(prefs.recent)
    ? prefs.recent.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(
        0,
        MAX_STICKER_RECENT
      )
    : [];
  return { favorites, recent };
}

export function readCachedStickerPrefs(userId: string): UserStickerPrefs | null {
  if (!userId) return null;
  const row = readBlob().byUser[userId];
  if (!row) return null;
  return sanitizePrefs(row);
}

export function writeCachedStickerPrefs(userId: string, prefs: UserStickerPrefs): void {
  if (!userId) return;
  const blob = readBlob();
  blob.byUser[userId] = sanitizePrefs(prefs);
  writeBlob(blob);
}
