import type { ChatMessage } from '@/api/chat';

export function mediaUrlCount(
  message: Pick<ChatMessage, 'mediaUrls' | 'thumbnailUrls'>
): number {
  const media = message.mediaUrls?.filter(Boolean).length ?? 0;
  const thumbs = message.thumbnailUrls?.filter(Boolean).length ?? 0;
  return media + thumbs;
}

export function shouldTombstoneMedia(message: ChatMessage): boolean {
  return (
    mediaUrlCount(message) > 0 ||
    message.messageType === 'IMAGE' ||
    message.messageType === 'VIDEO'
  );
}

export function isEmptyMediaMessage(message: ChatMessage): boolean {
  return (
    (message.messageType === 'IMAGE' || message.messageType === 'VIDEO') &&
    mediaUrlCount(message) === 0
  );
}

export function isDurableMediaPersist(message: ChatMessage): boolean {
  return mediaUrlCount(message) > 0 || isEmptyMediaMessage(message);
}

export function toMediaTombstone(message: ChatMessage): ChatMessage {
  return { ...message, mediaUrls: [], thumbnailUrls: [] };
}
