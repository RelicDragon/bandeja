import { Api } from 'grammy';
import { config } from '../../../config/env';
import { t } from '../../../utils/translations';
import { escapeMarkdown, getUserLanguageFromTelegramId } from '../utils';
import { buildMessageWithButtons } from '../shared/message-builder';

export async function sendNewBugNotification(
  api: Api,
  bug: { id: string; text: string; bugType: string },
  groupChannelId: string,
  senderName: string,
  recipient: { id: string; telegramId: string; language?: string | null }
) {
  if (!recipient.telegramId) return;

  try {
    const lang = await getUserLanguageFromTelegramId(recipient.telegramId, undefined);
    const bugText = (bug.text || 'Bug').substring(0, 100);
    const title = t('bugs.newBugTitle', lang) || 'New bug report';
    const message = `🐛 ${escapeMarkdown(title)}\n👤 *${escapeMarkdown(senderName)}*: ${escapeMarkdown(bugText)}`;

    const buttons = [[
      {
        text: t('telegram.viewChat', lang) || 'View',
        url: `${config.frontendUrl}/channel-chat/${groupChannelId}`,
      },
    ]];

    const { message: finalMessage, options } = buildMessageWithButtons(message, buttons, lang);
    await api.sendMessage(recipient.telegramId, finalMessage, options);
  } catch (error) {
    console.error(`Failed to send Telegram new bug notification to user ${recipient.id}:`, error);
  }
}
