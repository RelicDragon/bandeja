import prisma from '../../../config/database';
import { t } from '../../../utils/translations';
import { escapeMarkdown } from '../utils';
import { formatGameInfoForUser } from '../../shared/notification-base';
import { appendTelegramGameScheduleExtras, withOptionalSportPrefix } from '../../shared/notificationSport';
import { NotificationPreferenceService } from '../../notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';
import { PreferenceKey } from '../../../types/notifications.types';
import { getUserLanguageFromTelegramId } from '../utils';
import { config } from '../../../config/env';
import { buildMessageWithButtons } from '../shared/message-builder';
import { isBenignTelegramRecipientError } from '../telegramRecipientErrors';

export async function sendLeagueGameAssignedNotification(api: any, game: any, userId: string) {
  const allowed = await NotificationPreferenceService.doesUserAllow(
    userId,
    NotificationChannelType.TELEGRAM,
    PreferenceKey.SEND_INVITES
  );
  if (!allowed) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, telegramId: true, language: true, currentCityId: true, primarySport: true },
  });
  if (!user?.telegramId) return;

  const lang = await getUserLanguageFromTelegramId(user.telegramId, undefined);
  const gameInfo = await formatGameInfoForUser(game, user.currentCityId, lang);
  const assignedTitle = withOptionalSportPrefix(
    t('notifications.assignedToLeagueGame', lang),
    game.sport,
    user.primarySport,
    lang,
  );
  const scheduleLine = appendTelegramGameScheduleExtras(
    `📍 ${escapeMarkdown(gameInfo.place)} ${gameInfo.shortDayOfWeek} ${gameInfo.shortDate} ${gameInfo.startTime}, ${gameInfo.duration}`,
    game,
    user.primarySport,
    lang,
    escapeMarkdown,
  );
  const message = `🎯 ${escapeMarkdown(assignedTitle)}\n\n${scheduleLine}`;

  const buttons = [
    [{ text: t('telegram.viewGame', lang), url: `${config.frontendUrl}/games/${game.id}` }],
  ];
  const { message: finalMessage, options } = buildMessageWithButtons(message, buttons, lang);
  try {
    await api.sendMessage(user.telegramId, finalMessage, options);
  } catch (error) {
    if (isBenignTelegramRecipientError(error)) return;
    console.error(`Failed to send Telegram league game assigned to user ${userId}:`, error);
  }
}
