import { Api } from 'grammy';
import prisma from '../../../config/database';
import { ChatType, ChatContextType } from '@prisma/client';
import { NotificationPreferenceService } from '../../notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';
import { PreferenceKey } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import { escapeMarkdown, getUserLanguageFromTelegramId, trimTextForTelegram } from '../utils';
import { buildMessageWithButtons } from '../shared/message-builder';
import { formatGameInfoForUser } from '../../shared/notification-base';
import { ChatMuteService } from '../../chat/chatMute.service';
import { canParticipantSeeGameChatMessage } from '../../chat/gameChatVisibility';

function translateSystemMessage(message: any, lang: string): string {
  let messageData: any = null;
  let messageContent = '';
  try {
    messageData = JSON.parse(message.content);
    messageContent = messageData.text || message.content;
  } catch {
    messageContent = message.content || '';
  }

  if (messageData && messageData.type && messageData.variables) {
    const translationKey = `chat.systemMessages.${messageData.type}`;
    let template = t(translationKey, lang);
    
    if (template === translationKey) {
      template = messageData.text || messageContent;
    } else {
      for (const [key, value] of Object.entries(messageData.variables)) {
        template = template.replace(new RegExp(`{{${key}}}`, 'g'), String(value || ''));
      }
      messageContent = template;
    }
  }

  return messageContent;
}

export async function sendGameSystemMessageNotification(
  api: Api,
  message: any,
  game: any
) {

  const chatType = message.chatType as ChatType;
  const participants = await prisma.gameParticipant.findMany({
    where: { gameId: game.id },
    include: {
      user: {
        select: {
          id: true,
          telegramId: true,
          language: true,
          currentCityId: true,
        }
      }
    }
  });

  for (const participant of participants) {
    const user = participant.user;
    const allowed = await NotificationPreferenceService.doesUserAllow(user.id, NotificationChannelType.TELEGRAM, PreferenceKey.SEND_MESSAGES);
    if (!allowed || !user.telegramId) continue;

    const isMuted = await ChatMuteService.isChatMuted(user.id, ChatContextType.GAME, game.id);
    if (isMuted) {
      continue;
    }

    const canSeeMessage = canParticipantSeeGameChatMessage(participant, game, chatType);

    if (canSeeMessage) {
      try {
        const lang = await getUserLanguageFromTelegramId(user.telegramId, undefined);
        const gameInfo = await formatGameInfoForUser(game, user.currentCityId, lang);
        const translatedContent = translateSystemMessage(message, lang);
        
        const formattedMessage = `📍 ${escapeMarkdown(gameInfo.place)} ${gameInfo.shortDayOfWeek} ${gameInfo.shortDate} ${gameInfo.startTime}, ${gameInfo.duration}\n🔔 ${escapeMarkdown(translatedContent)}`;
        
        const buttons = [[
          {
            text: t('telegram.showGame', lang),
            callback_data: `sg:${game.id}:${user.id}`
          }
        ]];

        const { message: finalMessage, options } = buildMessageWithButtons(formattedMessage, buttons, lang);
        const trimmedMessage = trimTextForTelegram(finalMessage, false);
        
        await api.sendMessage(user.telegramId, trimmedMessage, options);
      } catch (error) {
        console.error(`Failed to send Telegram notification to user ${user.id}:`, error);
      }
    }
  }
}

