import { Api } from 'grammy';
import { config } from '../../../config/env';
import { t } from '../../../utils/translations';
import { escapeMarkdown, escapeHTML, convertMarkdownMessageToHTML, formatDuration } from '../utils';
import { formatDateInTimezone, getDateLabelInTimezone, getUserTimezoneFromCityId } from '../../user-timezone.service';

export async function sendLeagueRoundStartNotification(
  api: Api,
  game: any,
  user: any
) {
  if (!user.telegramId || !user.sendTelegramMessages) {
    return;
  }

  const lang = user.language || 'en';
  const timezone = await getUserTimezoneFromCityId(user.currentCityId);
  const shortDate = await getDateLabelInTimezone(game.startTime, timezone, lang, false);
  const startTime = await formatDateInTimezone(game.startTime, 'HH:mm', timezone, lang);
  const duration = formatDuration(new Date(game.startTime), new Date(game.endTime), lang);
  const place = game.court?.club?.name || game.club?.name || 'Unknown location';

  const leagueName = game.leagueSeason?.league?.name || 'League';
  const roundNumber = game.leagueRound?.orderIndex !== undefined ? game.leagueRound.orderIndex + 1 : 1;

  const message = `🎾 ${escapeMarkdown(t('telegram.leagueRoundStartReceived', lang))}\n\n` +
    `🏆 *${escapeMarkdown(leagueName)}*\n` +
    `📅 ${escapeMarkdown(t('telegram.round', lang))} ${roundNumber}\n\n` +
    `📍 ${escapeMarkdown(place)} ${shortDate} ${startTime}, ${duration}`;

  const gameUrl = `${config.frontendUrl}/games/${game.id}`;
  const isLocalhost = gameUrl.includes('localhost') || gameUrl.includes('127.0.0.1');

  const replyMarkup: any = {
    inline_keyboard: []
  };

  let parseMode: 'Markdown' | 'HTML' = 'Markdown';

  if (!isLocalhost) {
    replyMarkup.inline_keyboard.push([
      {
        text: t('telegram.viewGame', lang),
        url: gameUrl
      }
    ]);
  } else {
    parseMode = 'HTML';
    const htmlMessage = convertMarkdownMessageToHTML(message);
    const viewGameText = escapeHTML(t('telegram.viewGame', lang));
    const finalMessage = `${htmlMessage}\n\n🔗 <a href="${escapeHTML(gameUrl)}">${viewGameText}</a>`;
    
    try {
      await api.sendMessage(user.telegramId, finalMessage, {
        parse_mode: parseMode
      });
      return;
    } catch (error) {
      console.error(`Failed to send Telegram league round start notification to user ${user.id}:`, error);
      return;
    }
  }

  try {
    await api.sendMessage(user.telegramId, message, {
      parse_mode: parseMode,
      reply_markup: replyMarkup
    });
  } catch (error) {
    console.error(`Failed to send Telegram league round start notification to user ${user.id}:`, error);
  }
}

