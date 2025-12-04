import { Api } from 'grammy';
import prisma from '../../../config/database';
import { ChatType } from '@prisma/client';
import { t } from '../../../utils/translations';
import { escapeMarkdown, formatDuration } from '../utils';
import { formatDateInTimezone, getDateLabelInTimezone, getUserTimezoneFromCityId } from '../../user-timezone.service';
import { SystemMessageType } from '../../../utils/systemMessages';

export async function sendGameSystemMessageNotification(
  api: Api,
  message: any,
  game: any
) {
  const place = game.court?.club?.name || game.club?.name || 'Unknown location';
  
  let messageData: any = null;
  let messageContent = '';
  try {
    messageData = JSON.parse(message.content);
    messageContent = messageData.text || message.content;
  } catch {
    messageContent = message.content || '';
  }

  const chatType = message.chatType as ChatType;
  const participants = await prisma.gameParticipant.findMany({
    where: { gameId: game.id },
    include: {
      user: {
        select: {
          id: true,
          telegramId: true,
          sendTelegramMessages: true,
          language: true,
          currentCityId: true,
        }
      }
    }
  });

  for (const participant of participants) {
    const user = participant.user;
    
    if (!user.telegramId || !user.sendTelegramMessages) {
      continue;
    }

    let canSeeMessage = false;
    
    if (chatType === ChatType.PUBLIC) {
      canSeeMessage = true;
    } else if (chatType === ChatType.PRIVATE) {
      canSeeMessage = participant.isPlaying;
    } else if (chatType === ChatType.ADMINS) {
      canSeeMessage = participant.role === 'OWNER' || participant.role === 'ADMIN';
    }

    if (canSeeMessage) {
      try {
        const lang = user.language || 'en';
        const timezone = await getUserTimezoneFromCityId(user.currentCityId);
        const shortDate = await getDateLabelInTimezone(game.startTime, timezone, lang, false);
        const startTime = await formatDateInTimezone(game.startTime, 'HH:mm', timezone, lang);
        const duration = formatDuration(new Date(game.startTime), new Date(game.endTime), lang);
        
        let translatedContent = messageContent;
        if (messageData && messageData.type && messageData.variables) {
          const translationKey = `chat.systemMessages.${messageData.type}`;
          let template = t(translationKey, lang);
          
          if (template === translationKey) {
            template = messageData.text || messageContent;
          } else {
            for (const [key, value] of Object.entries(messageData.variables)) {
              template = template.replace(new RegExp(`{{${key}}}`, 'g'), String(value || ''));
            }
            translatedContent = template;
          }
        }
        
        const formattedMessage = `📍 ${escapeMarkdown(place)} ${shortDate} ${startTime}, ${duration}\n🔔 ${escapeMarkdown(translatedContent)}`;
        
        const showGameButton = t('telegram.showGame', lang);
        const showGameData = `sg:${game.id}:${user.id}`;
        
        await api.sendMessage(user.telegramId, formattedMessage, { 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              {
                text: showGameButton,
                callback_data: showGameData
              }
            ]]
          }
        });
      } catch (error) {
        console.error(`Failed to send Telegram notification to user ${user.id}:`, error);
      }
    }
  }
}

