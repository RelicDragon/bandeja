import { Api } from 'grammy';
import { ChatContextType } from '@prisma/client';
import { t } from '../../../utils/translations';
import { escapeMarkdown, getUserLanguageFromTelegramId, trimTextForTelegram } from '../utils';
import { buildMessageWithButtons } from '../shared/message-builder';
import { formatUserName } from '../../shared/notification-base';
import { ChatMuteService } from '../../chat/chatMute.service';
import { NotificationPreferenceService } from '../../notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';
import { PreferenceKey } from '../../../types/notifications.types';

export async function sendUserChatNotification(
  api: Api,
  message: any,
  userChat: any,
  sender: any
) {
  const senderName = formatUserName(sender);
  const messageContent = message.content || '[Media]';

  const recipient = userChat.user1Id === sender.id ? userChat.user2 : userChat.user1;

  if (!recipient || recipient.id === sender.id) return;
  const allowed = await NotificationPreferenceService.doesUserAllow(recipient.id, NotificationChannelType.TELEGRAM, PreferenceKey.SEND_DIRECT_MESSAGES);
  if (!allowed || !recipient.telegramId) return;

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
    const formattedMessage = `💬 *${escapeMarkdown(senderName)}*: ${escapeMarkdown(messageContent)}`;
    
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

