import type { ChatMessage } from '@/api/chat';
import { getLastMessageText } from '@/api/chat';
import { parseMessagePreview } from '@/utils/messagePreview';
import { getSystemMessageText } from '@/utils/systemMessages';
import type { TFunction } from 'i18next';

export function isThreadSearchSystemMessage(message: ChatMessage): boolean {
  return message.content?.trim().startsWith('{') ?? false;
}

export function getThreadSearchSenderLabel(
  message: ChatMessage,
  currentUserId: string | undefined,
  t: TFunction
): string {
  if (isThreadSearchSystemMessage(message)) {
    return t('chat.system', { defaultValue: 'System' });
  }
  if (message.senderId && currentUserId && message.senderId === currentUserId) {
    return t('chat.you', { defaultValue: 'You' });
  }
  const sender = message.sender;
  if (sender) {
    const name = `${sender.firstName || ''} ${sender.lastName || ''}`.trim();
    if (name) return name;
    if (sender.firstName) return sender.firstName;
  }
  return t('common.unknown', { defaultValue: 'Unknown' });
}

export function getThreadSearchPreviewLine(message: ChatMessage, t: TFunction): string {
  if (isThreadSearchSystemMessage(message)) {
    const text = getSystemMessageText(message.content);
    if (text) return text;
  }
  if (message.poll?.question) return message.poll.question;
  const raw = getLastMessageText(message) || '';
  const parsed = parseMessagePreview(raw, t);
  return parsed || t('chat.mediaMessage', { defaultValue: 'Media' });
}
