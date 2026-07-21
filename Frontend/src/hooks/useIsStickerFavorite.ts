import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { isStickerFavorite, toggleStickerFavorite } from '@/services/stickers/stickerFavorites';
import { subscribeStickerFavoritesChanged } from '@/services/stickers/stickerFavoritesEvents';

/**
 * Tracks whether a catalog sticker is in the user's favorites and toggles it via
 * the shared favorites service. Stays in sync across the tray and message menu.
 */
export function useIsStickerFavorite(stickerId: string | null | undefined) {
  const userId = useAuthStore((s) => s.user?.id);
  const [isFavorite, setIsFavorite] = useState<boolean>(() => isStickerFavorite(stickerId));
  const [busy, setBusy] = useState(false);

  // Re-read the cache whenever the sticker, user, or favorites change.
  useEffect(() => {
    setIsFavorite(isStickerFavorite(stickerId));
  }, [stickerId, userId]);

  useEffect(() => {
    const unsubscribe = subscribeStickerFavoritesChanged(() => {
      setIsFavorite(isStickerFavorite(stickerId));
    });
    return unsubscribe;
  }, [stickerId]);

  const toggle = useCallback(async (): Promise<boolean | null> => {
    if (!stickerId || busy) return null;
    setBusy(true);
    try {
      // Optimistic local flip for snappy UI; the event reconciles the real state.
      setIsFavorite((prev) => !prev);
      // Service resolves to the actual resulting favorite state (or null if no-op),
      // so callers can give accurate feedback even on rollback.
      return await toggleStickerFavorite(stickerId);
    } finally {
      setBusy(false);
    }
  }, [stickerId, busy]);

  return { isFavorite, toggle, busy };
}
