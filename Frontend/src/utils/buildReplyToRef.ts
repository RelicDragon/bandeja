import type { ChatMessage } from '@/api/chat';

/** Compact replyTo payload for optimistic sends + composer strip. */
export function buildReplyToRef(
  message: Pick<
    ChatMessage,
    | 'id'
    | 'content'
    | 'messageType'
    | 'mediaUrls'
    | 'thumbnailUrls'
    | 'stickerId'
    | 'stickerEmoji'
    | 'audioDurationMs'
    | 'videoDurationMs'
    | 'sender'
  >
): NonNullable<ChatMessage['replyTo']> {
  return {
    id: message.id,
    content: message.content ?? '',
    messageType: message.messageType,
    mediaUrls: message.mediaUrls?.length ? [...message.mediaUrls] : undefined,
    thumbnailUrls: message.thumbnailUrls?.length ? [...message.thumbnailUrls] : undefined,
    stickerId: message.stickerId,
    stickerEmoji: message.stickerEmoji,
    audioDurationMs: message.audioDurationMs,
    videoDurationMs: message.videoDurationMs,
    sender: message.sender || { id: 'system', firstName: 'System' },
  };
}
