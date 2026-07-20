import type { TFunction } from 'i18next';
import type { ChatMessage } from '@/api/chat';
import { convertMentionsToPlaintext } from '@/utils/parseMentions';
import { formatStickerPreviewText } from '@/utils/stickerPreview';
import { looksLikeGifMediaUrl } from '@/utils/gifMediaUrl';

export { looksLikeGifMediaUrl };

const REPLY_TRUNCATE_LEN = 100;

export type ReplyToPreviewSource = NonNullable<ChatMessage['replyTo']>;

function truncate(str: string, max: number): string {
  const t = str.trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trim() + '…';
}

function isStickerReply(replyTo: ReplyToPreviewSource): boolean {
  return replyTo.messageType === 'STICKER' || !!replyTo.stickerId;
}

function isImageOrMediaReply(replyTo: ReplyToPreviewSource): boolean {
  if (replyTo.messageType === 'VOICE' || replyTo.messageType === 'VIDEO') return false;
  if (isStickerReply(replyTo)) return false;
  return (
    replyTo.messageType === 'IMAGE' ||
    (Array.isArray(replyTo.mediaUrls) && replyTo.mediaUrls.length > 0)
  );
}

/** Localized label for the reply preview body (composer strip + in-bubble). */
export function getReplyPreviewDisplayContent(
  replyTo: ReplyToPreviewSource,
  t: TFunction
): string {
  if (replyTo.messageType === 'VOICE') {
    return t('chat.voiceMessage', { defaultValue: 'Voice message' });
  }
  if (replyTo.messageType === 'VIDEO') {
    return t('chat.videoMessage', { defaultValue: 'Video' });
  }
  if (isStickerReply(replyTo)) {
    return formatStickerPreviewText(
      replyTo.stickerEmoji,
      t('chat.stickerMessage', { defaultValue: 'Sticker' })
    );
  }

  const raw = convertMentionsToPlaintext(replyTo.content || '');
  const truncated = truncate(raw, REPLY_TRUNCATE_LEN);
  if (truncated) return truncated;

  if (isImageOrMediaReply(replyTo)) {
    const urls = replyTo.mediaUrls ?? [];
    const gif = urls.some(looksLikeGifMediaUrl);
    return gif
      ? t('chat.giphy.attach', { defaultValue: 'GIF' })
      : t('chat.photo', { defaultValue: 'Photo' });
  }

  return t('chat.noContent', { defaultValue: '(no text)' });
}

/** First media URL suitable for a tiny reply-preview thumb (GIF/photo). */
export function getReplyPreviewMediaThumbUrl(
  replyTo: ReplyToPreviewSource
): string | null {
  if (!isImageOrMediaReply(replyTo)) return null;
  const thumb = replyTo.thumbnailUrls?.[0]?.trim();
  if (thumb) return thumb;
  const url = replyTo.mediaUrls?.[0]?.trim();
  return url || null;
}
