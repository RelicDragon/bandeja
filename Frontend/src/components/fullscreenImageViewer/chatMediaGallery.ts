import type { ChatContextType, ChatMessage, ChatType } from '@/api/chat';

export type FullscreenMediaKind = 'image' | 'video';

export type FullscreenMediaItem = {
  id: string;
  messageId: string;
  mediaIndex: number;
  kind: FullscreenMediaKind;
  originalUrl: string;
  previewUrl: string;
};

export type ChatMediaGalleryScope = {
  contextType: ChatContextType;
  contextId: string;
  chatType: ChatType;
};

export function chatMediaGalleryItemId(messageId: string, mediaIndex: number): string {
  return `${messageId}:media:${mediaIndex}`;
}

function documentMediaKind(message: ChatMessage): FullscreenMediaKind | null {
  const mime = message.documentMimeType?.trim().toLowerCase() ?? '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';

  // Older uploads can have no MIME type (or application/octet-stream). In
  // that case, only opt in file extensions browsers can normally preview.
  const candidate = message.documentFileName || message.mediaUrls?.[0] || '';
  const path = candidate.split(/[?#]/, 1)[0]?.toLowerCase() ?? '';
  if (/\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/.test(path)) return 'image';
  if (/\.(?:m4v|mov|mp4|ogv|webm)$/.test(path)) return 'video';
  return null;
}

function messageMediaKind(message: ChatMessage): FullscreenMediaKind | null {
  switch (message.messageType) {
    case 'VIDEO':
      return 'video';
    case 'DOCUMENT':
      return documentMediaKind(message);
    case 'VOICE':
    case 'STICKER':
    case 'POLL':
    case 'TEXT':
      return null;
    case 'IMAGE':
    case undefined:
      // Older image messages predate messageType and are identified by mediaUrls.
      return 'image';
  }
}

/**
 * Builds the fullscreen gallery from the already loaded chat timeline.
 * The three-part scope check is deliberately repeated here even though the
 * message list is normally scoped upstream: game chat tabs share contextId.
 */
export function buildChatMediaGallery(
  messages: readonly ChatMessage[],
  scope: ChatMediaGalleryScope,
): FullscreenMediaItem[] {
  const items: FullscreenMediaItem[] = [];

  for (const message of messages) {
    if (
      message.chatContextType !== scope.contextType ||
      message.contextId !== scope.contextId ||
      message.chatType !== scope.chatType ||
      message.deletedAt
    ) {
      continue;
    }

    const kind = messageMediaKind(message);
    if (!kind) continue;

    const mediaUrls = message.mediaUrls ?? [];
    const availableMediaCount = Math.max(mediaUrls.length, message.thumbnailUrls?.length ?? 0);
    const count = message.messageType === 'VIDEO' || message.messageType === 'DOCUMENT'
      ? Math.min(availableMediaCount, 1)
      : availableMediaCount;

    for (let mediaIndex = 0; mediaIndex < count; mediaIndex += 1) {
      const originalUrl = mediaUrls[mediaIndex]?.trim() || message.thumbnailUrls?.[mediaIndex]?.trim();
      if (!originalUrl) continue;
      const previewUrl = message.thumbnailUrls?.[mediaIndex]?.trim() || originalUrl;
      items.push({
        id: chatMediaGalleryItemId(message.id, mediaIndex),
        messageId: message.id,
        mediaIndex,
        kind,
        originalUrl,
        previewUrl,
      });
    }
  }

  return items;
}
