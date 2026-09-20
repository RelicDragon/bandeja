/**
 * PRD 357 — weather alert delivered over Telegram.
 *
 * The organizer's message carries a `wx:<gameId>:keep` callback (registered in
 * `bot.service.ts`, handled in `handlers/callback.handler.ts`) plus a deep link
 * that opens the move-indoor sheet. Participants only get the link.
 */
import { Api } from 'grammy';
import { config } from '../../../config/env';
import { escapeMarkdown } from '../utils';
import { buildMessageWithButtons } from '../shared/message-builder';
import { isBenignTelegramRecipientError } from '../telegramRecipientErrors';
import { weatherT } from '../../weather/weatherAlertCopy';

export interface WeatherAlertTelegramPayload {
  telegramId: string;
  language: string;
  title: string;
  body: string;
  gameId: string;
  isOrganizer: boolean;
}

export async function sendGameWeatherAlertTelegram(
  api: Api,
  payload: WeatherAlertTelegramPayload,
): Promise<boolean> {
  const lang = payload.language || 'en';
  const message = `${escapeMarkdown(payload.title)}\n\n${escapeMarkdown(payload.body)}`;

  const gameUrl = `${config.frontendUrl}/games/${payload.gameId}`;
  const buttons: { text: string; url?: string; callback_data?: string }[][] = [];

  if (payload.isOrganizer) {
    buttons.push([
      {
        text: weatherT('weather.actionMoveIndoor', lang),
        url: `${gameUrl}?section=weather&action=moveIndoor`,
      },
      {
        text: weatherT('weather.actionKeepAsPlanned', lang),
        callback_data: `wx:${payload.gameId}:keep`,
      },
    ]);
  }

  buttons.push([
    {
      text: weatherT('weather.actionViewForecast', lang),
      url: `${gameUrl}?section=weather`,
    },
  ]);

  const { message: finalMessage, options } = buildMessageWithButtons(message, buttons, lang);
  try {
    await api.sendMessage(payload.telegramId, finalMessage, options);
    return true;
  } catch (error) {
    if (isBenignTelegramRecipientError(error)) return false;
    console.error('[WeatherAlert] Failed to send Telegram alert:', error);
    return false;
  }
}
