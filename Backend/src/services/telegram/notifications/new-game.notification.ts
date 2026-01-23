import { Api } from 'grammy';
import { config } from '../../../config/env';
import { t } from '../../../utils/translations';
import { escapeMarkdown, getUserLanguageFromTelegramId, trimTextForTelegram } from '../utils';
import { buildMessageWithButtons } from '../shared/message-builder';
import { formatNewGameText } from '../../shared/notification-base';
import { getUserTimezoneFromCityId } from '../../user-timezone.service';

export async function sendNewGameNotification(
  api: Api,
  game: any,
  recipient: any
) {
  if (!game || !recipient || !recipient.telegramId) {
    return;
  }

  try {
    const lang = await getUserLanguageFromTelegramId(recipient.telegramId, undefined);
    const timezone = await getUserTimezoneFromCityId(recipient.currentCityId);
    const gameText = await formatNewGameText(game, timezone, lang, {
      includeParticipants: true,
      includeLink: false,
      escapeMarkdown: true
    });
    
    const title = t('telegram.newGameCreated', lang) || 'New game created';
    
    let message = `🎾 ${escapeMarkdown(title)}\n\n${gameText}`;

    if (game.description) {
      message += `\n\n💬 ${escapeMarkdown(game.description)}`;
    }

    const buttons = [[
      {
        text: t('telegram.viewGame', lang),
        url: `${config.frontendUrl}/games/${game.id}`
      }
    ]];

    const { message: finalMessage, options } = buildMessageWithButtons(message, buttons, lang);
    const trimmedMessage = trimTextForTelegram(finalMessage, false);

    await api.sendMessage(recipient.telegramId, trimmedMessage, options);
  } catch (error) {
    console.error(`Failed to send Telegram new game notification to user ${recipient.id}:`, error);
  }
}

