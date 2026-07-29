import { Api } from 'grammy';
import { config } from '../../../config/env';
import { NotificationType } from '../../../types/notifications.types';
import { escapeMarkdown, getUserLanguageFromTelegramId, trimTextForTelegram } from '../utils';
import { buildMessageWithButtons } from '../shared/message-builder';
import { isBenignTelegramRecipientError } from '../telegramRecipientErrors';
import { guardedTelegramSendMessage } from '../guardedTelegramSend';
import { t } from '../../../utils/translations';

type PlayIntentTelegramPayload = {
  type: NotificationType;
  title: string;
  body: string;
  data?: {
    proposalId?: string;
    gameId?: string;
  };
};

export async function sendPlayIntentTelegramNotification(
  api: Api,
  userId: string,
  telegramId: string,
  payload: PlayIntentTelegramPayload,
) {
  if (!telegramId) return;

  try {
    const lang = await getUserLanguageFromTelegramId(telegramId, undefined);
    const title = escapeMarkdown(payload.title);
    const body = escapeMarkdown(payload.body);
    const message = `🎾 ${title}\n\n${body}`;

    let buttonText = t('telegram.openApp', lang) || 'Open';
    let buttons: Array<Array<{ text: string; url?: string; callback_data?: string }>> = [
      [{ text: buttonText, url: config.frontendUrl }],
    ];

    if (payload.type === NotificationType.PLAY_INTENT_MATCH && payload.data?.proposalId) {
      buttonText = t('telegram.viewMatch', lang) || 'View match';
      // Always callback button (same pattern as "Show game") — URL-only buttons
      // become unclickable HTML links when FRONTEND_URL is localhost.
      buttons = [[{ text: buttonText, callback_data: `sip:${payload.data.proposalId}:${userId}` }]];
    } else if (
      (payload.type === NotificationType.GAME_MATCHES_INTENT ||
        payload.type === NotificationType.INTENT_PLAYERS_FOR_GAME) &&
      payload.data?.gameId
    ) {
      buttonText = t('telegram.showGame', lang) || t('telegram.viewGame', lang) || 'View Game';
      buttons = [[{ text: buttonText, callback_data: `sg:${payload.data.gameId}:${userId}` }]];
    }

    const { message: finalMessage, options } = buildMessageWithButtons(message, buttons, lang);
    const trimmedMessage = trimTextForTelegram(finalMessage, false);

    await guardedTelegramSendMessage(
      api,
      { userId, telegramId, kind: `play-intent-${payload.type.toLowerCase()}` },
      () => api.sendMessage(telegramId, trimmedMessage, options),
    );
  } catch (error) {
    if (isBenignTelegramRecipientError(error)) return;
    console.error(`Failed to send Telegram play-intent notification to user ${userId}:`, error);
  }
}
