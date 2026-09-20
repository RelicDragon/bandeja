import { Api } from 'grammy';
import prisma from '../../../config/database';
import { NotificationPreferenceService } from '../../notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';
import { PreferenceKey } from '../../../types/notifications.types';
import { config } from '../../../config/env';
import { t } from '../../../utils/translations';
import { escapeMarkdown, getUserLanguageFromTelegramId } from '../utils';
import { buildMessageWithButtons } from '../shared/message-builder';
import { formatGameInfoForUser } from '../../shared/notification-base';
import { appendTelegramGameScheduleExtras, buildGameReminderTitle } from '../../shared/notificationSport';
import { isBenignTelegramRecipientError } from '../telegramRecipientErrors';
import { guardedTelegramSendMessage } from '../guardedTelegramSend';
import { buildAttendanceCallbackData } from '../../gameAttendance/attendanceRules';

/** PRD 346 — attendance extras on the reminder. */
export type TelegramGameReminderOptions = {
  /** Append the two inline attendance buttons (`at:<gameId>:confirm|unsure`). */
  attendanceActions?: boolean;
  /** Restrict the fan-out (the 2 h reminder only goes to unanswered players). */
  onlyUserIds?: string[];
};

export async function sendGameReminderNotification(
  api: Api,
  gameId: string,
  hoursBeforeStart: number,
  options: TelegramGameReminderOptions = {}
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
      status: 'PLAYING',
    },
    include: {
      user: {
        select: {
          id: true,
          telegramId: true,
          language: true,
          currentCityId: true,
          primarySport: true,
        }
      }
    }
  });

  const onlyUserIds = options.onlyUserIds ? new Set(options.onlyUserIds) : null;

  for (const participant of participants) {
    const user = participant.user;
    if (onlyUserIds && !onlyUserIds.has(user.id)) continue;
    const allowed = await NotificationPreferenceService.doesUserAllow(user.id, NotificationChannelType.TELEGRAM, PreferenceKey.SEND_REMINDERS);
    if (!allowed || !user.telegramId) continue;
    const telegramId = user.telegramId;

    try {
      const lang = await getUserLanguageFromTelegramId(user.telegramId, undefined);
      const gameInfo = await formatGameInfoForUser(game, user.currentCityId, lang);
      const entityTypeLabel = t(`games.entityTypes.${game.entityType}`, lang);
      
      const reminderText = buildGameReminderTitle(
        game.entityType,
        hoursBeforeStart,
        game.sport,
        user.primarySport,
        lang,
      );
      
      let message = `⏰ ${escapeMarkdown(reminderText)}\n\n`;
      if (game.name) {
        message += `🎾 ${escapeMarkdown(entityTypeLabel)}: ${escapeMarkdown(game.name)}\n`;
      } else {
        message += `🎾 ${escapeMarkdown(entityTypeLabel)}\n`;
      }
      message += appendTelegramGameScheduleExtras(
        `📍 ${escapeMarkdown(gameInfo.place)} ${gameInfo.shortDayOfWeek} ${gameInfo.shortDate} ${gameInfo.startTime}, ${gameInfo.duration}`,
        game,
        user.primarySport,
        lang,
        escapeMarkdown,
      );

      if (game.description) {
        message += `\n\n${escapeMarkdown(game.description)}`;
      }

      if (options.attendanceActions) {
        message += `\n\n${escapeMarkdown(t('attendance.telegramQuestion', lang))}`;
      }

      const buttons: { text: string; url?: string; callback_data?: string }[][] = [];
      if (options.attendanceActions) {
        buttons.push([
          {
            text: t('attendance.confirmAction', lang),
            callback_data: buildAttendanceCallbackData(game.id, 'CONFIRMED'),
          },
          {
            text: t('attendance.unsureAction', lang),
            callback_data: buildAttendanceCallbackData(game.id, 'UNSURE'),
          },
        ]);
      }
      buttons.push([
        {
          text: t('telegram.viewGame', lang),
          url: `${config.frontendUrl}/games/${game.id}`
        }
      ]);

      const { message: finalMessage, options: sendOptions } = buildMessageWithButtons(
        message,
        buttons,
        lang,
      );

      await guardedTelegramSendMessage(
        api,
        { userId: user.id, telegramId, kind: 'game-reminder' },
        () => api.sendMessage(telegramId, finalMessage, sendOptions),
      );
    } catch (error) {
      if (!isBenignTelegramRecipientError(error)) {
        console.error(`Failed to send Telegram reminder to user ${user.id}:`, error);
      }
    }
  }
}

