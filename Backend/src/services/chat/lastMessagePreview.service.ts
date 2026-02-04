import prisma from '../../config/database';
import { ChatContextType } from '@prisma/client';

const MAX_PREVIEW_LENGTH = 200;

interface MessageForPreview {
  content: string | null;
  mediaUrls: string[];
}

function isSystemMessageContent(content: string | null): boolean {
  if (!content?.trim()) return false;
  try {
    const parsed = JSON.parse(content) as unknown;
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      'type' in parsed &&
      'text' in parsed
    );
  } catch {
    return false;
  }
}

function getSystemMessageText(content: string): string {
  try {
    const parsed = JSON.parse(content) as { text?: string };
    return typeof parsed.text === 'string' ? parsed.text : content;
  } catch {
    return content;
  }
}

export function extractPreviewFromMessage(message: MessageForPreview): string {
  const hasMedia = Array.isArray(message.mediaUrls) && message.mediaUrls.length > 0;
  const hasText = Boolean(message.content?.trim());

  if (hasMedia && !hasText) return '[Media]';
  if (!hasText) return '[Media]';

  const text = isSystemMessageContent(message.content)
    ? getSystemMessageText(message.content!)
    : message.content!;

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
    select: { content: true, mediaUrls: true },
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
