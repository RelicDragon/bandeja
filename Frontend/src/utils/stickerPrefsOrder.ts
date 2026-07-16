/** Keep in sync with Backend `stickerConstants`. */
export const MAX_STICKER_FAVORITES = 100;
export const MAX_STICKER_RECENT = 40;

export function bumpStickerRecentIds(
  recent: string[],
  stickerId: string,
  max: number = MAX_STICKER_RECENT
): string[] {
  if (!stickerId) return recent.slice(0, max);
  return [stickerId, ...recent.filter((id) => id !== stickerId)].slice(0, max);
}

/**
 * Keep optimistic Recent heads that have not landed on the server yet
 * (send → reopen tray before `bumpStickerRecent` finishes).
 * Once an id appears on the server, server order wins for the rest.
 */
export function mergeRecentPrefs(
  localRecent: string[],
  serverRecent: string[],
  max: number = MAX_STICKER_RECENT
): string[] {
  const serverSet = new Set(serverRecent);
  const pendingHead: string[] = [];
  for (const id of localRecent) {
    if (serverSet.has(id)) break;
    pendingHead.push(id);
  }
  let merged = serverRecent.slice(0, max);
  for (const id of [...pendingHead].reverse()) {
    merged = bumpStickerRecentIds(merged, id, max);
  }
  return merged;
}

/** Apply server prefs without dropping optimistic Recent heads. */
export function mergeServerStickerPrefs(
  server: { favorites: string[]; recent: string[] },
  localRecent: string[]
): { favorites: string[]; recent: string[] } {
  return {
    favorites: server.favorites,
    recent: mergeRecentPrefs(localRecent, server.recent),
  };
}

export function toggleStickerFavoriteIds(
  favorites: string[],
  stickerId: string,
  max: number = MAX_STICKER_FAVORITES
): { favorites: string[]; isFavorite: boolean } {
  if (!stickerId) return { favorites: favorites.slice(0, max), isFavorite: false };
  const isFavorite = favorites.includes(stickerId);
  if (isFavorite) {
    return {
      favorites: favorites.filter((id) => id !== stickerId),
      isFavorite: false,
    };
  }
  return {
    favorites: [stickerId, ...favorites.filter((id) => id !== stickerId)].slice(0, max),
    isFavorite: true,
  };
}
