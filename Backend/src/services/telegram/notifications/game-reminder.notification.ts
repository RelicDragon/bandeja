import { Api } from 'grammy';
import prisma from '../../../config/database';
import { config } from '../../../config/env';
import { t } from '../../../utils/translations';
import { escapeMarkdown, getUserLanguageFromTelegramId } from '../utils';
import { buildMessageWithButtons } from '../shared/message-builder';
import { formatGameInfoForUser } from '../../shared/notification-base';

export async function sendGameReminderNotification(
  api: Api,
  gameId: string,
  hoursBeforeStart: number
) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      club: true,
      court: {
        include: {
          club: true,
        },
      },
    },
  });

  if (!game) {
    return;
  }

  const participants = await prisma.gameParticipant.findMany({
    where: { 
      gameId: game.id,
      isPlaying: true,
    },
    include: {
      user: {
        select: {
          id: true,
          telegramId: true,
          sendTelegramReminders: true,
          language: true,
          currentCityId: true,
        }
      }
    }
  });

  for (const participant of participants) {
    const user = participant.user;
    
    if (!user.telegramId || !user.sendTelegramReminders) {
      continue;
    }

    try {
      const lang = await getUserLanguageFromTelegramId(user.telegramId, undefined);
      const gameInfo = await formatGameInfoForUser(game, user.currentCityId, lang);
      const entityTypeLabel = t(`games.entityTypes.${game.entityType}`, lang);
      
      const reminderKey = `telegram.gameReminder${hoursBeforeStart === 24 ? '24h' : '2h'}.${game.entityType}`;
      const reminderText = t(reminderKey, lang) !== reminderKey ? t(reminderKey, lang) : (hoursBeforeStart === 24 ? t('telegram.gameReminder24h', lang) : t('telegram.gameReminder2h', lang));
      
      let message = `⏰ ${escapeMarkdown(reminderText)}\n\n`;
      if (game.name) {
        message += `🎾 ${escapeMarkdown(entityTypeLabel)}: ${escapeMarkdown(game.name)}\n`;
      } else {
        message += `🎾 ${escapeMarkdown(entityTypeLabel)}\n`;
      }
      message += `📍 ${escapeMarkdown(gameInfo.place)} ${gameInfo.shortDate} ${gameInfo.startTime}, ${gameInfo.duration}`;

      if (game.description) {
        message += `\n\n${escapeMarkdown(game.description)}`;
      }

      const buttons = [[
        {
          text: t('telegram.viewGame', lang),
          url: `${config.frontendUrl}/games/${game.id}`
        }
      ]];

      const { message: finalMessage, options } = buildMessageWithButtons(message, buttons, lang);

      await api.sendMessage(user.telegramId, finalMessage, options);
    } catch (error) {
      console.error(`Failed to send Telegram reminder to user ${user.id}:`, error);
    }
  }
}

