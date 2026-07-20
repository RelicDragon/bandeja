import type { ChatMessage } from '@/api/chat';
import {
  fetchAndCacheSticker,
  getCachedSticker,
} from '@/services/stickers/stickerCatalogCache';
import { resolveStickerDisplayUrl } from '@/utils/resolveStickerDisplayUrl';

export interface ResolveMessageCopyTargetOptions {
  reduceMotion?: boolean;
}

/**
 * Resolve the best image URL to copy for a message, or null when there is no
 * copyable image (text/voice/video/poll/system).
 *
 * - STICKER: hydrate by id (memory cache → GET /stickers/:id), pick animated
 *   unless reduce-motion. Missing/inactive catalog entries resolve to null so
 *   callers can fall back to the emoji text.
 * - IMAGE / GIF: the first media URL at full quality (thumbnail only as a
 *   last resort).
 */
export async function resolveMessageCopyTargetUrl(
  message: Pick<ChatMessage, 'messageType' | 'stickerId' | 'mediaUrls' | 'thumbnailUrls'>,
  options: ResolveMessageCopyTargetOptions = {}
): Promise<string | null> {
  if (message.messageType === 'STICKER') {
    const id = message.stickerId?.trim();
    if (!id) return null;
    const cached = getCachedSticker(id);
    const sticker =
      cached ?? (await fetchAndCacheSticker(id).catch(() => null));
    if (!sticker) return null;
    const url = resolveStickerDisplayUrl({
      staticUrl: sticker.staticUrl,
      animatedUrl: sticker.animatedUrl,
      reduceMotion: !!options.reduceMotion,
    });
    return url ?? null;
  }

  if (message.messageType === 'IMAGE') {
    const url =
      message.mediaUrls?.[0]?.trim() ||
      message.thumbnailUrls?.[0]?.trim() ||
      '';
    return url || null;
  }

  return null;
}
