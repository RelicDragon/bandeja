import prisma from '../../config/database';
import { ChatContextType } from '@prisma/client';

const MAX_PREVIEW_LENGTH = 200;

interface MessageForPreview {
  content: string | null;
  mediaUrls: string[];
  pollId: string | null;
  messageType?: string;
  audioDurationMs?: number | null;
}

function formatVoicePreviewLabel(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function extractPreviewFromMessage(message: MessageForPreview): string {
  if (message.messageType === 'VOICE' && message.audioDurationMs != null) {
    return `[TYPE:VOICE]${formatVoicePreviewLabel(message.audioDurationMs)}`;
  }

  const hasMedia = Array.isArray(message.mediaUrls) && message.mediaUrls.length > 0;
  const hasText = Boolean(message.content?.trim());

  if (hasMedia && !hasText) return '[TYPE:MEDIA]';
  if (!hasText) return '[TYPE:MEDIA]';

  const text = message.content!;

  // Handle poll messages - check pollId field
  if (message.pollId) {
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
  const lastMessage = await prisma.chatMessage.findFirst({
    where: { chatContextType, contextId },
    orderBy: { createdAt: 'desc' },
    select: {
      content: true,
      mediaUrls: true,
      pollId: true,
      messageType: true,
      audioDurationMs: true,
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
        data: { lastMessagePreview: preview },
      });
      break;
  }
}
