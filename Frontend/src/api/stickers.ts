import api from './axios';
import type { ApiResponse } from '@/types';
import type { Sport } from '@shared/sport';

export type StickerDto = {
  id: string;
  packId: string;
  slug?: string;
  emoji: string;
  title: string | null;
  staticUrl: string;
  animatedUrl: string | null;
  width: number;
  height: number;
  sortOrder: number;
  /** Present on GET /stickers/:id (hydrate may return inactive catalog rows). */
  isActive?: boolean;
  packActive?: boolean;
};

export type StickerPackListItem = {
  id: string;
  slug: string;
  title: string;
  sport: Sport | null;
  locale: string | null;
  isOfficial: boolean;
  ownerUserId?: string | null;
  sortOrder: number;
  stickerCount: number;
  coverSticker: {
    id: string;
    slug?: string;
    emoji: string;
    staticUrl: string;
    animatedUrl: string | null;
    width: number;
    height: number;
  } | null;
};

export type ChatMediaRecent =
  | { kind: 'STICKER'; stickerId: string }
  | {
      kind: 'GIF';
      provider: 'GIPHY';
      id: string;
      title: string;
      previewUrl: string;
      downloadUrl: string;
      width: number;
      height: number;
    };

export type UserStickerPrefs = {
  favorites: string[];
  recentMedia: ChatMediaRecent[];
};

export async function listStickerPacks(sport?: Sport | null): Promise<StickerPackListItem[]> {
  const params = sport ? { sport } : undefined;
  const { data } = await api.get<ApiResponse<{ packs: StickerPackListItem[] }>>('/stickers/packs', {
    params,
  });
  return data.data.packs;
}

export async function getStickerPack(
  packId: string
): Promise<{ pack: StickerPackListItem; stickers: StickerDto[] }> {
  const { data } = await api.get<ApiResponse<{ pack: StickerPackListItem; stickers: StickerDto[] }>>(
    `/stickers/packs/${packId}`
  );
  return data.data;
}

export async function getSticker(stickerId: string): Promise<StickerDto> {
  const { data } = await api.get<ApiResponse<{ sticker: StickerDto }>>(`/stickers/${stickerId}`);
  return data.data.sticker;
}

export async function getMyStickerPrefs(): Promise<UserStickerPrefs> {
  const { data } = await api.get<ApiResponse<UserStickerPrefs>>('/stickers/me/prefs');
  return data.data;
}

export async function putMyStickerPrefs(
  prefs: Partial<UserStickerPrefs>
): Promise<UserStickerPrefs> {
  const { data } = await api.put<ApiResponse<UserStickerPrefs>>('/stickers/me/prefs', prefs);
  return data.data;
}

export async function bumpMyChatMediaRecent(item: ChatMediaRecent): Promise<UserStickerPrefs> {
  const { data } = await api.post<ApiResponse<UserStickerPrefs>>('/stickers/me/recents', { item });
  return data.data;
}

export async function saveStickerFromMessage(
  messageId: string,
  mediaIndex?: number
): Promise<StickerDto> {
  const { data } = await api.post<ApiResponse<{ sticker: StickerDto }>>('/stickers/me/from-message', {
    messageId,
    ...(mediaIndex != null ? { mediaIndex } : {}),
  });
  return data.data.sticker;
}

export async function deactivateMySticker(stickerId: string): Promise<void> {
  await api.delete<ApiResponse<{ ok: boolean }>>(`/stickers/me/${stickerId}`);
}
