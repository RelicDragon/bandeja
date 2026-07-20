import { Api } from 'grammy';
import { escapeMarkdown, escapeHTML } from './utils';

export async function updateInviteTelegramMessage(args: {
  api: Api;
  chatId: number;
  messageId: number;
  originalText: string;
  statusLine: string;
  success: boolean;
  replyMarkup?: { inline_keyboard: unknown[] };
}): Promise<void> {
  const { api, chatId, messageId, originalText, statusLine, success, replyMarkup } = args;
  const isHTML = originalText.includes('<') && originalText.includes('>');
  const parseMode = isHTML ? 'HTML' : 'Markdown';
  const escapeFunction = isHTML ? escapeHTML : escapeMarkdown;

  let cleanedMessage = originalText.replace(/^(✅|❌)[^\n]*(?:\n\n?)?/s, '');
  cleanedMessage = cleanedMessage.replace(/^🎯[^\n]*(?:\n\n?)?/s, '');
  const prefix = success ? '✅ ' : '❌ ';
  const updatedMessage = escapeFunction(prefix + statusLine) + '\n\n' + cleanedMessage.trim();

  const newReplyMarkup = success ? { inline_keyboard: [] } : replyMarkup;
  const hasContentChanged = originalText !== updatedMessage;
  const hasMarkupChanged =
    success &&
    replyMarkup &&
    JSON.stringify(replyMarkup) !== JSON.stringify(newReplyMarkup);

  if (!hasContentChanged && !hasMarkupChanged) return;

  await api.editMessageText(chatId, messageId, updatedMessage, {
    parse_mode: parseMode,
    reply_markup: newReplyMarkup as { inline_keyboard: [] } | undefined,
  });
}
