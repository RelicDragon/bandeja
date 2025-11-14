import { Api } from 'grammy';
import { t } from '../../../utils/translations';
import { escapeMarkdown } from '../utils';

export async function sendUserChatNotification(
  api: Api,
  message: any,
  userChat: any,
  sender: any
) {
  const senderName = `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || 'Unknown';
  const messageContent = message.content || '[Media]';

  const recipient = userChat.user1Id === sender.id ? userChat.user2 : userChat.user1;

  if (!recipient || !recipient.telegramId || !recipient.sendTelegramDirectMessages || recipient.id === sender.id) {
    return;
  }

  try {
    const lang = recipient.language || 'en';
    const formattedMessage = `💬 *${escapeMarkdown(senderName)}*: ${escapeMarkdown(messageContent)}`;
    
    const replyButton = t('telegram.reply', lang);
    const replyData = `rum:${message.id}:${userChat.id}`;
    
    await api.sendMessage(recipient.telegramId, formattedMessage, { 
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          {
            text: replyButton,
            callback_data: replyData
          }
        ]]
      }
    });
  } catch (error) {
    console.error(`Failed to send Telegram notification to user ${recipient.id}:`, error);
  }
}

