import { putMyStickerPrefs, type UserStickerPrefs } from '@/api/stickers';
import { useAuthStore } from '@/store/authStore';
import {
  readCachedStickerPrefs,
  writeCachedStickerPrefs,
} from '@/services/stickers/stickerPrefsCache';
import { mergeServerStickerPrefs, toggleStickerFavoriteIds } from '@/utils/stickerPrefsOrder';
import {
  emitStickerFavoritesChanged,
  type StickerFavoritesChangedDetail,
} from '@/services/stickers/stickerFavoritesEvents';

const EMPTY_PREFS: UserStickerPrefs = { favorites: [], recentMedia: [] };

/** Serialize toggles so concurrent callers never clobber each other's favorites. */
let chain: Promise<unknown> = Promise.resolve();

function currentUserId(): string | null {
  return useAuthStore.getState().user?.id ?? null;
}

function readPrefs(userId: string): UserStickerPrefs {
  return readCachedStickerPrefs(userId) ?? EMPTY_PREFS;
}

function broadcast(userId: string): void {
  const detail: StickerFavoritesChangedDetail = { userId };
  emitStickerFavoritesChanged(detail);
}

/**
 * Toggle a sticker in the user's favorites. Single source of truth: reads the
 * local cache, applies the toggle optimistically (cache + event), persists via
 * PUT /stickers/me/prefs, reconciles with the server response, and re-broadcasts.
 * Rolls back on failure. Returns the new favorite state, or null if the toggle
 * could not run (no user / no sticker id).
 */
export function toggleStickerFavorite(stickerId: string): Promise<boolean | null> {
  const id = stickerId?.trim();
  const userId = currentUserId();
  if (!userId || !id) return Promise.resolve(null);

  chain = chain
    .catch(() => undefined)
    .then(async () => {
      const prev = readPrefs(userId);
      const { favorites, isFavorite } = toggleStickerFavoriteIds(prev.favorites, id);

      // Optimistic: write cache + notify listeners immediately.
      const optimistic: UserStickerPrefs = { ...prev, favorites };
      writeCachedStickerPrefs(userId, optimistic);
      broadcast(userId);

      try {
        const saved = await putMyStickerPrefs({ favorites });
        const reconciled = mergeServerStickerPrefs(saved, readPrefs(userId).recentMedia);
        writeCachedStickerPrefs(userId, reconciled);
        broadcast(userId);
        return isFavorite;
      } catch {
        // Roll back to the pre-toggle cache and let listeners recover.
        writeCachedStickerPrefs(userId, prev);
        broadcast(userId);
        return !isFavorite;
      }
    });

  return chain as Promise<boolean | null>;
}

/** Whether a sticker is currently favorited, per the local cache. */
export function isStickerFavorite(stickerId: string | null | undefined): boolean {
  const id = stickerId?.trim();
  if (!id) return false;
  const userId = currentUserId();
  if (!userId) return false;
  return readPrefs(userId).favorites.includes(id);
}
