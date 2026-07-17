import type { ChatMediaRecent } from '@/api/stickers';

/** Keep in sync with Backend `stickerConstants`. */
export const MAX_STICKER_FAVORITES = 100;
export const MAX_STICKER_RECENT = 40;

export function chatMediaRecentKey(item: ChatMediaRecent): string {
  return item.kind === 'STICKER'
    ? `sticker:${item.stickerId}`
    : `gif:${item.provider}:${item.id}`;
}

export function bumpChatMediaRecent(
  recent: ChatMediaRecent[],
  item: ChatMediaRecent,
  max: number = MAX_STICKER_RECENT
): ChatMediaRecent[] {
  const key = chatMediaRecentKey(item);
  return [item, ...recent.filter((existing) => chatMediaRecentKey(existing) !== key)].slice(0, max);
}

/**
 * Keep optimistic Recent heads that have not landed on the server yet
 * (send → reopen tray before `bumpStickerRecent` finishes).
 * Once an id appears on the server, server order wins for the rest.
 */
export function mergeRecentPrefs(
  localRecent: ChatMediaRecent[],
  serverRecent: ChatMediaRecent[],
  max: number = MAX_STICKER_RECENT
): ChatMediaRecent[] {
  const serverSet = new Set(serverRecent.map(chatMediaRecentKey));
  const pendingHead: ChatMediaRecent[] = [];
  for (const item of localRecent) {
    if (serverSet.has(chatMediaRecentKey(item))) break;
    pendingHead.push(item);
  }
  let merged = serverRecent.slice(0, max);
  for (const item of [...pendingHead].reverse()) {
    merged = bumpChatMediaRecent(merged, item, max);
  }
  return merged;
}

/** Apply server prefs without dropping optimistic Recent heads. */
export function mergeServerStickerPrefs(
  server: { favorites: string[]; recentMedia: ChatMediaRecent[] },
  localRecent: ChatMediaRecent[]
): { favorites: string[]; recentMedia: ChatMediaRecent[] } {
  return {
    favorites: server.favorites,
    recentMedia: mergeRecentPrefs(localRecent, server.recentMedia),
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
