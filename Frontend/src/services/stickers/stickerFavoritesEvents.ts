export const BANDEJA_STICKER_FAVORITES_CHANGED = 'bandeja:sticker-favorites-changed';

export type StickerFavoritesChangedDetail = {
  userId: string;
};

/**
 * Broadcast that the user's sticker favorites changed (optimistic, reconciled,
 * or rolled back). The tray and any menu/hook subscribe to keep in sync when a
 * favorite is toggled from outside their own UI.
 */
export function emitStickerFavoritesChanged(detail: StickerFavoritesChangedDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(BANDEJA_STICKER_FAVORITES_CHANGED, { detail }));
}

export function subscribeStickerFavoritesChanged(
  handler: (detail: StickerFavoritesChangedDetail) => void
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<StickerFavoritesChangedDetail>).detail;
    if (detail) handler(detail);
  };
  window.addEventListener(BANDEJA_STICKER_FAVORITES_CHANGED, listener);
  return () => window.removeEventListener(BANDEJA_STICKER_FAVORITES_CHANGED, listener);
}
