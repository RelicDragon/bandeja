import { Api } from 'grammy';
import { ChatContextType } from '@prisma/client';
import { t } from '../../../utils/translations';
import { getUserLanguageFromTelegramId } from '../utils';
import { formatUserName } from '../../shared/notification-base';
import { ChatMuteService } from '../../chat/chatMute.service';
import { NotificationPreferenceService } from '../../notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';
import { PreferenceKey } from '../../../types/notifications.types';
import { isBenignTelegramRecipientError } from '../telegramRecipientErrors';
import { guardedTelegramSendMessage } from '../guardedTelegramSend';
import { sendTelegramChatMediaNotification } from './telegram-chat-media.notification';

export async function sendUserChatNotification(
  api: Api,
  message: any,
  userChat: any,
  sender: any
) {
  const recipient = userChat.user1Id === sender.id ? userChat.user2 : userChat.user1;
  const senderName = formatUserName(sender);

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
    const resolvedLang = await getUserLanguageFromTelegramId(recipient.telegramId, undefined);
    const buttons = [[
      {
        text: t('telegram.reply', resolvedLang),
        callback_data: `rum:${message.id}:${userChat.id}`
      }
    ]];

    await guardedTelegramSendMessage(
      api,
      { userId: recipient.id, telegramId: recipient.telegramId, kind: 'user-chat' },
      () => sendTelegramChatMediaNotification(api, {
        telegramId: recipient.telegramId,
        message,
        senderName,
        captionPrefix: '',
        buttons,
        lang: resolvedLang,
        senderLineStyle: 'dm',
      }),
    );
  } catch (error) {
    if (isBenignTelegramRecipientError(error)) return;
    console.error(`Failed to send Telegram notification to user ${recipient.id}:`, error);
  }
}
