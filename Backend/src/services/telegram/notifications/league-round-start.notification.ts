import { Api } from 'grammy';
import { config } from '../../../config/env';
import { t } from '../../../utils/translations';
import { escapeMarkdown, getUserLanguageFromTelegramId } from '../utils';
import { buildMessageWithButtons } from '../shared/message-builder';
import { formatGameInfoForUser } from '../../shared/notification-base';

export async function sendLeagueRoundStartNotification(
  api: Api,
  game: any,
  user: any
) {
  if (!user.telegramId || !user.sendTelegramMessages) {
    return;
  }

  const lang = await getUserLanguageFromTelegramId(user.telegramId, undefined);
  const gameInfo = await formatGameInfoForUser(game, user.currentCityId, lang);

  const leagueName = game.leagueSeason?.league?.name || 'League';
  const roundNumber = game.leagueRound?.orderIndex !== undefined ? game.leagueRound.orderIndex + 1 : 1;

  const message = `🎾 ${escapeMarkdown(t('telegram.leagueRoundStartReceived', lang))}\n\n` +
    `🏆 *${escapeMarkdown(leagueName)}*\n` +
    `📅 ${escapeMarkdown(t('telegram.round', lang))} ${roundNumber}\n\n` +
    `📍 ${escapeMarkdown(gameInfo.place)} ${gameInfo.shortDate} ${gameInfo.startTime}, ${gameInfo.duration}`;

  const buttons = [[
    {
      text: t('telegram.viewGame', lang),
      url: `${config.frontendUrl}/games/${game.id}`
    }
  ]];

  const { message: finalMessage, options } = buildMessageWithButtons(message, buttons, lang);

  try {
    await api.sendMessage(user.telegramId, finalMessage, options);
  } catch (error) {
    console.error(`Failed to send Telegram league round start notification to user ${user.id}:`, error);
  }
}

