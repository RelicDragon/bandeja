import { useEffect, useState } from 'react';
import {
  fetchAndCacheSticker,
  getCachedSticker,
  type CachedSticker,
} from '@/services/stickers/stickerCatalogCache';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { resolveStickerDisplayUrl } from '@/utils/resolveStickerDisplayUrl';

export type StickerAssetState = {
  /** URL to render (animated when allowed; always static under reduced motion). */
  displayUrl: string | null;
  staticUrl: string | null;
  animatedUrl: string | null;
  loading: boolean;
  missing: boolean;
  sticker: CachedSticker | null;
};

/**
 * Hydrate a sticker asset by id (memory cache → GET /stickers/:id).
 * Missing/inactive catalog entries fail soft — callers must use stickerEmoji fallback.
 */
export function useStickerAsset(stickerId: string | null | undefined): StickerAssetState {
  const id = stickerId?.trim() || null;
  const reduceMotion = usePrefersReducedMotion();
  const [sticker, setSticker] = useState<CachedSticker | null>(() =>
    id ? getCachedSticker(id) : null
  );
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!id) {
      setSticker(null);
      setMissing(false);
      return;
    }

    const cached = getCachedSticker(id);
    if (cached) {
      setSticker(cached);
      setMissing(false);
      return;
    }

    // Clear previous sticker immediately so recycled rows never flash the wrong asset.
    setSticker(null);
    setMissing(false);

    let cancelled = false;
    void (async () => {
      try {
        const next = await fetchAndCacheSticker(id);
        if (!cancelled) {
          setSticker(next);
          setMissing(false);
        }
      } catch {
        if (!cancelled) {
          setSticker(null);
          setMissing(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const staticUrl = sticker?.staticUrl?.trim() || null;
  const animatedUrl = sticker?.animatedUrl?.trim() || null;
  const displayUrl = resolveStickerDisplayUrl({ staticUrl, animatedUrl, reduceMotion });
  const loading = !!id && !sticker && !missing;

  return {
    displayUrl,
    staticUrl,
    animatedUrl,
    loading,
    missing,
    sticker,
  };
}
