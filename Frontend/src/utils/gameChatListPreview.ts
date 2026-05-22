import type { ChatMessage } from '@/api/chat';
import { normalizeChatType } from '@/utils/chatType';
import { formatVoiceDurationMmSs } from '@/utils/messagePreview';

/** Game list rows show PUBLIC channel activity only (matches backend lastMessagePreview). */
export function isGamePublicListPreviewMessage(
  message: Pick<ChatMessage, 'chatContextType' | 'chatType'>
): boolean {
  if (message.chatContextType !== 'GAME') return true;
  return normalizeChatType(message.chatType) === 'PUBLIC';
}

export function chatMessageToGameListPreview(message: ChatMessage): {
  preview: string;
  updatedAt: string;
} {
  const updatedAt = message.updatedAt ?? message.createdAt;
  if (message.messageType === 'VOICE' && message.audioDurationMs != null) {
    return { preview: `[TYPE:VOICE]${formatVoiceDurationMmSs(message.audioDurationMs)}`, updatedAt };
  }
  if (message.messageType === 'VIDEO' && message.videoDurationMs != null) {
    return { preview: `[TYPE:VIDEO]${formatVoiceDurationMmSs(message.videoDurationMs)}`, updatedAt };
  }
  const hasMedia = (message.mediaUrls?.length ?? 0) > 0;
  const text = message.content?.trim() ?? '';
  if (hasMedia && !text) return { preview: '[TYPE:MEDIA]', updatedAt };
  if (!text && message.poll?.question) return { preview: `[TYPE:POLL]${message.poll.question}`, updatedAt };
  if (!text) return { preview: '[TYPE:MEDIA]', updatedAt };
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed?.type && parsed?.variables) return { preview: `[TYPE:SYSTEM]${text}`, updatedAt };
    } catch {
      /* plain text */
    }
  }
  const trimmed = text.length > 200 ? `${text.slice(0, 199)}…` : text;
  return { preview: trimmed, updatedAt };
}
