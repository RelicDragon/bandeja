import { Api } from 'grammy';
import { ChatContextType } from '@prisma/client';
import { t } from '../../../utils/translations';
import { escapeMarkdown, getUserLanguageFromTelegramId, trimTextForTelegram } from '../utils';
import { buildMessageWithButtons } from '../shared/message-builder';
import { formatUserName } from '../../shared/notification-base';
import { getShortDayOfWeekForUser } from '../../user-timezone.service';
import { ChatMuteService } from '../../chat/chatMute.service';

export async function sendUserChatNotification(
  api: Api,
  message: any,
  userChat: any,
  sender: any
) {
  const senderName = formatUserName(sender);
  const messageContent = message.content || '[Media]';

  const recipient = userChat.user1Id === sender.id ? userChat.user2 : userChat.user1;

  if (!recipient || !recipient.telegramId || !recipient.sendTelegramDirectMessages || recipient.id === sender.id) {
    return;
  }

  const mentionIds = message.mentionIds || [];
  const hasMentions = mentionIds.length > 0;
  const isMentioned = hasMentions && mentionIds.includes(recipient.id);

  if (hasMentions && !isMentioned) {
    return;
  }

  if (!hasMentions) {
    const isMuted = await ChatMuteService.isChatMuted(recipient.id, ChatContextType.USER, userChat.id);
    if (isMuted) {
      return;
    }
  }

  try {
    const lang = await getUserLanguageFromTelegramId(recipient.telegramId, undefined);
    const shortDayOfWeek = await getShortDayOfWeekForUser(new Date(), recipient.currentCityId, lang);
    const formattedMessage = `${shortDayOfWeek} 💬 *${escapeMarkdown(senderName)}*: ${escapeMarkdown(messageContent)}`;
    
    const buttons = [[
      {
        text: t('telegram.reply', lang),
        callback_data: `rum:${message.id}:${userChat.id}`
      }
    ]];

    const { message: finalMessage, options } = buildMessageWithButtons(formattedMessage, buttons, lang);
    const trimmedMessage = trimTextForTelegram(finalMessage, false);
    
    await api.sendMessage(recipient.telegramId, trimmedMessage, options);
  } catch (error) {
    console.error(`Failed to send Telegram notification to user ${recipient.id}:`, error);
  }
}

