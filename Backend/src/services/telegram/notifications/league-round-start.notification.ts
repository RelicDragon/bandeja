import { Api } from 'grammy';
import { t } from '../../../utils/translations';
import { escapeMarkdown, getUserLanguageFromTelegramId } from '../utils';
import { buildMessageWithButtons } from '../shared/message-builder';
import { formatGameInfoForUser } from '../../shared/notification-base';
import { appendTelegramGameScheduleExtras, withOptionalSportPrefix } from '../../shared/notificationSport';
import { NotificationPreferenceService } from '../../notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';
import { PreferenceKey } from '../../../types/notifications.types';
import { isBenignTelegramRecipientError } from '../telegramRecipientErrors';
import { buildLeagueRoundStartViewUrl } from '../../league/leagueBracketDeepLink.util';
import {
  leagueRoundStartNotificationLines,
  leagueRoundStartNotificationTitleKey,
  leagueRoundStartViewButtonKey,
} from '../../league/leagueRoundStartNotificationCopy.util';

export async function sendLeagueRoundStartNotification(
  api: Api,
  game: any,
  user: any
) {
  const allowed = await NotificationPreferenceService.doesUserAllow(user.id, NotificationChannelType.TELEGRAM, PreferenceKey.SEND_MESSAGES);
  if (!allowed || !user.telegramId) return;

  const lang = await getUserLanguageFromTelegramId(user.telegramId, undefined);
  const gameInfo = await formatGameInfoForUser(game, user.currentCityId, lang);

  const roundTitle = withOptionalSportPrefix(
    t(leagueRoundStartNotificationTitleKey(game), lang),
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
  const { leagueLine, roundLine } = leagueRoundStartNotificationLines(game, lang);
  const message =
    `🎾 ${escapeMarkdown(roundTitle)}\n\n` +
    `🏆 *${escapeMarkdown(leagueLine)}*\n` +
    `📅 ${escapeMarkdown(roundLine)}\n\n` +
    scheduleLine;

  const viewUrl = buildLeagueRoundStartViewUrl(game);
  const buttons = [[
    {
      text: t(leagueRoundStartViewButtonKey(game), lang),
      url: viewUrl,
    }
  ]];

  const { message: finalMessage, options } = buildMessageWithButtons(message, buttons, lang);

  try {
    await api.sendMessage(user.telegramId, finalMessage, options);
  } catch (error) {
    if (isBenignTelegramRecipientError(error)) return;
    console.error(`Failed to send Telegram league round start notification to user ${user.id}:`, error);
  }
}

