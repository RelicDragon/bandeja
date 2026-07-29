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
  language?: string;
  data?: {
    proposalId?: string;
    gameId?: string;
    playIntentId?: string;
  };
};

export async function sendPlayIntentTelegramNotification(
  api: Api,
  userId: string,
  telegramId: string,
  payload: PlayIntentTelegramPayload,
): Promise<boolean> {
  if (!telegramId) return false;

  try {
    const lang =
      payload.language ||
      (await getUserLanguageFromTelegramId(telegramId, undefined));
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
    } else if (
      payload.type === NotificationType.FOLLOWED_USER_PLAY_INTENT &&
      payload.data?.playIntentId
    ) {
      buttonText = t('telegram.playToo', lang) || 'I want to play too';
      const joinUrl = `${config.frontendUrl.replace(/\/$/, '')}/?joinPlayIntent=${encodeURIComponent(payload.data.playIntentId)}`;
      buttons = [[{ text: buttonText, url: joinUrl }]];
    }

    const { message: finalMessage, options } = buildMessageWithButtons(message, buttons, lang);
    const trimmedMessage = trimTextForTelegram(finalMessage, false);

    await guardedTelegramSendMessage(
      api,
      { userId, telegramId, kind: `play-intent-${payload.type.toLowerCase()}` },
      () => api.sendMessage(telegramId, trimmedMessage, options),
    );
    return true;
  } catch (error) {
    if (isBenignTelegramRecipientError(error)) return false;
    console.error(`Failed to send Telegram play-intent notification to user ${userId}:`, error);
    return false;
  }
}
