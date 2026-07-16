import { isAxiosError } from 'axios';
import toast from 'react-hot-toast';
import type { TFunction } from 'i18next';
import type { ChatMessage } from '@/api/chat';
import { saveStickerFromMessage } from '@/api/stickers';
import {
  invalidateStickerPackListCache,
  invalidateStickerPackStickersCache,
  putCachedSticker,
} from '@/services/stickers/stickerCatalogCache';
import { emitPersonalStickerSaved } from '@/services/stickers/personalStickerEvents';

export function isEligibleSaveAsStickerMessage(message: ChatMessage): boolean {
  if (message.messageType !== 'IMAGE') return false;
  if (message.deletedAt) return false;
  return Array.isArray(message.mediaUrls) && message.mediaUrls.length > 0;
}

function errorCodeFromUnknown(err: unknown): string | undefined {
  if (!isAxiosError(err)) return undefined;
  const data = err.response?.data as { code?: string; data?: { code?: string } } | undefined;
  return data?.code ?? data?.data?.code;
}

export async function saveChatImageAsSticker(
  message: ChatMessage,
  t: TFunction,
  mediaIndex = 0
): Promise<boolean> {
  if (!isEligibleSaveAsStickerMessage(message)) {
    toast.error(
      t('chat.contextMenu.saveAsStickerNotEligible', {
        defaultValue: 'Only chat images can be saved as stickers',
      })
    );
    return false;
  }

  try {
    const sticker = await saveStickerFromMessage(message.id, mediaIndex);
    putCachedSticker(sticker);
    invalidateStickerPackListCache();
    invalidateStickerPackStickersCache(sticker.packId);
    emitPersonalStickerSaved({ stickerId: sticker.id, packId: sticker.packId });
    toast.success(
      t('chat.contextMenu.saveAsStickerSuccess', { defaultValue: 'Saved to My stickers' })
    );
    return true;
  } catch (err) {
    const code = errorCodeFromUnknown(err);
    const keyByCode: Record<string, { key: string; defaultValue: string }> = {
      'sticker.personal.unsupportedFormat': {
        key: 'chat.contextMenu.saveAsStickerBadFormat',
        defaultValue: 'Use PNG, WebP, or GIF with transparency (not JPEG)',
      },
      'sticker.personal.noAlpha': {
        key: 'chat.contextMenu.saveAsStickerNoAlpha',
        defaultValue: 'Stickers need a transparent background',
      },
      'sticker.personal.invalidDimensions': {
        key: 'chat.contextMenu.saveAsStickerBadSize',
        defaultValue: 'Image size is not valid for a sticker',
      },
      'sticker.personal.tooLarge': {
        key: 'chat.contextMenu.saveAsStickerTooLarge',
        defaultValue: 'Image is too large for a sticker',
      },
      'sticker.personal.packFull': {
        key: 'chat.contextMenu.saveAsStickerPackFull',
        defaultValue: 'Personal sticker limit reached',
      },
      'sticker.personal.rateLimited': {
        key: 'chat.contextMenu.saveAsStickerRateLimited',
        defaultValue: 'Too many saves — try again shortly',
      },
    };
    const mapped = code ? keyByCode[code] : undefined;
    toast.error(
      mapped
        ? t(mapped.key, { defaultValue: mapped.defaultValue })
        : t('chat.contextMenu.saveAsStickerFailed', {
            defaultValue: 'Could not save as sticker',
          })
    );
    return false;
  }
}
