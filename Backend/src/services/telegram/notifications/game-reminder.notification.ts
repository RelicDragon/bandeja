import { Api } from 'grammy';
import prisma from '../../../config/database';
import { config } from '../../../config/env';
import { t } from '../../../utils/translations';
import { escapeMarkdown, escapeHTML, convertMarkdownMessageToHTML, formatDuration } from '../utils';
import { formatDateInTimezone, getDateLabelInTimezone, getUserTimezoneFromCityId } from '../../user-timezone.service';

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

  const place = game.court?.club?.name || game.club?.name || 'Unknown location';

  for (const participant of participants) {
    const user = participant.user;
    
    if (!user.telegramId || !user.sendTelegramReminders) {
      continue;
    }

    try {
      const lang = user.language || 'en';
      const timezone = await getUserTimezoneFromCityId(user.currentCityId);
      const shortDate = await getDateLabelInTimezone(game.startTime, timezone, lang, false);
      const startTime = await formatDateInTimezone(game.startTime, 'HH:mm', timezone, lang);
      const duration = formatDuration(new Date(game.startTime), new Date(game.endTime), lang);
      const entityTypeLabel = t(`games.entityTypes.${game.entityType}`, lang);
      
      const reminderText = hoursBeforeStart === 24 
        ? t('telegram.gameReminder24h', lang) 
        : t('telegram.gameReminder2h', lang);
      
      let message = `⏰ ${escapeMarkdown(reminderText)}\n\n`;
      if (game.name) {
        message += `🎾 ${escapeMarkdown(entityTypeLabel)}: ${escapeMarkdown(game.name)}\n`;
      } else {
        message += `🎾 ${escapeMarkdown(entityTypeLabel)}\n`;
      }
      message += `📍 ${escapeMarkdown(place)} ${shortDate} ${startTime}, ${duration}`;

      if (game.description) {
        message += `\n\n${escapeMarkdown(game.description)}`;
      }

      const gameUrl = `${config.frontendUrl}/games/${game.id}`;
      const isLocalhost = gameUrl.includes('localhost') || gameUrl.includes('127.0.0.1');

      let parseMode: 'Markdown' | 'HTML' = 'Markdown';
      const replyMarkup: any = {};

      if (isLocalhost) {
        parseMode = 'HTML';
        message = convertMarkdownMessageToHTML(message);
        const viewGameText = escapeHTML(t('telegram.viewGame', lang));
        message += `\n\n🔗 <a href="${escapeHTML(gameUrl)}">${viewGameText}</a>`;
      } else {
        replyMarkup.inline_keyboard = [
          [
            {
              text: t('telegram.viewGame', lang),
              url: gameUrl
            }
          ]
        ];
      }

      await api.sendMessage(user.telegramId, message, {
        parse_mode: parseMode,
        ...(Object.keys(replyMarkup).length > 0 ? { reply_markup: replyMarkup } : {})
      });
    } catch (error) {
      console.error(`Failed to send Telegram reminder to user ${user.id}:`, error);
    }
  }
}

