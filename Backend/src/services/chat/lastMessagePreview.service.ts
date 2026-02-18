import prisma from '../../config/database';
import { ChatContextType } from '@prisma/client';

const MAX_PREVIEW_LENGTH = 200;

interface MessageForPreview {
  content: string | null;
  mediaUrls: string[];
  pollId: string | null;
}


export function extractPreviewFromMessage(message: MessageForPreview): string {
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
