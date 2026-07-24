import prisma from '../../config/database';
import { ChatContextType, ChatType } from '@prisma/client';
import { formatStoryReplyPreview, hasStoryReplyPayload } from './storyReplySanitize';

const MAX_PREVIEW_LENGTH = 200;

interface MessageForPreview {
  content: string | null;
  mediaUrls: string[];
  pollId: string | null;
  messageType?: string;
  audioDurationMs?: number | null;
  videoDurationMs?: number | null;
  stickerEmoji?: string | null;
  documentFileName?: string | null;
  storyReply?: unknown;
}

function formatVoicePreviewLabel(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const GIF_PROVIDER_HOSTS = ['giphy.com', 'klipy.com', 'tenor.com', 'tenor.co'];

/** True when a stored media URL points at an animated GIF (re-hosted or provider-hosted). */
export function looksLikeGifMediaUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let host = '';
  let path = '';
  try {
    const parsed = new URL(url);
    host = parsed.hostname.toLowerCase().replace(/\.$/, '');
    path = parsed.pathname.toLowerCase();
  } catch {
    const fallback = url.toLowerCase();
    return /\.gif($|\?)/.test(fallback) || /\/giphy\.(gif|webp|png)($|\?)/.test(fallback);
  }
  if (GIF_PROVIDER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return true;
  if (path.endsWith('.gif') || path.includes('.gif.')) return true;
  return /\/giphy\.(gif|webp|png)$/.test(path);
}

export function extractPreviewFromMessage(message: MessageForPreview): string {
  if (hasStoryReplyPayload(message.storyReply)) {
    return formatStoryReplyPreview(message.content);
  }

  if (message.messageType === 'VOICE' && message.audioDurationMs != null) {
    return `[TYPE:VOICE]${formatVoicePreviewLabel(message.audioDurationMs)}`;
  }
  if (message.messageType === 'VIDEO' && message.videoDurationMs != null) {
    return `[TYPE:VIDEO]${formatVoicePreviewLabel(message.videoDurationMs)}`;
  }
  if (message.messageType === 'DOCUMENT') {
    const name =
      typeof message.documentFileName === 'string' ? message.documentFileName.trim() : '';
    return name ? `[TYPE:DOCUMENT]${name}` : '[TYPE:DOCUMENT]';
  }
  if (message.messageType === 'STICKER') {
    const emoji =
      typeof message.stickerEmoji === 'string' && message.stickerEmoji.trim()
        ? message.stickerEmoji.trim()
        : '';
    return emoji ? `[TYPE:STICKER]${emoji}` : '[TYPE:STICKER]';
  }

  const hasMedia = Array.isArray(message.mediaUrls) && message.mediaUrls.length > 0;
  const hasText = Boolean(message.content?.trim());

  if (hasMedia && !hasText && looksLikeGifMediaUrl(message.mediaUrls[0])) {
    return '[TYPE:GIF]';
  }
  if (hasMedia && !hasText) return '[TYPE:MEDIA]';
  if (!hasText) return '[TYPE:MEDIA]';

  const text = message.content!;

  // Handle poll messages (host or linked forward with question in content)
  if (message.pollId || message.messageType === 'POLL') {
    return `[TYPE:POLL]${text}`;
  }

  // Handle system messages - store tag with the JSON (match frontend: type + variables)
  if (text.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed.type && parsed.variables && typeof parsed.variables === 'object') {
        return `[TYPE:SYSTEM]${text}`;
      }
    } catch {
      // Not a valid system message, treat as regular text
    }
  }

  // Regular text messages - truncate if needed
  const trimmed = text.trim();
  if (trimmed.length <= MAX_PREVIEW_LENGTH) return trimmed;
  return trimmed.slice(0, MAX_PREVIEW_LENGTH - 1) + '…';
}

export async function updateLastMessagePreview(
  chatContextType: ChatContextType,
  contextId: string
): Promise<void> {
  const where: {
    chatContextType: ChatContextType;
    contextId: string;
    deletedAt: null;
    chatType?: ChatType;
  } = { chatContextType, contextId, deletedAt: null };
  if (chatContextType === 'GAME') {
    where.chatType = ChatType.PUBLIC;
  }

  const lastMessage = await prisma.chatMessage.findFirst({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      content: true,
      mediaUrls: true,
      pollId: true,
      messageType: true,
      audioDurationMs: true,
      videoDurationMs: true,
      stickerEmoji: true,
      documentFileName: true,
      storyReply: true,
      senderId: true,
    },
  });

  const preview = lastMessage
    ? extractPreviewFromMessage(lastMessage)
    : null;

  switch (chatContextType) {
    case 'USER':
      await prisma.userChat.update({
        where: { id: contextId },
        data: { lastMessagePreview: preview },
      });
      break;
    case 'GAME':
      await prisma.game.update({
        where: { id: contextId },
        data: { lastMessagePreview: preview },
      });
      break;
    case 'BUG':
      await prisma.bug.update({
        where: { id: contextId },
        data: { lastMessagePreview: preview },
      });
      break;
    case 'GROUP':
      await prisma.groupChannel.update({
        where: { id: contextId },
        data: {
          lastMessagePreview: preview,
          lastMessageSenderId: lastMessage?.senderId ?? null,
        },
      });
      break;
  }
}
