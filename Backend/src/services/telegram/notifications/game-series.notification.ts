import { Api } from 'grammy';
import { config } from '../../../config/env';
import { t } from '../../../utils/translations';
import { escapeMarkdown } from '../utils';
import { buildMessageWithButtons } from '../shared/message-builder';
import { isBenignTelegramRecipientError } from '../telegramRecipientErrors';
import { seriesT } from '../../gameSeries/gameSeriesCopy';

/**
 * PRD 345 — "Same time next week?" Telegram prompt.
 *
 * The two buttons carry the `sr:<gameId>:<accept|decline>` callback registered
 * in `bot.service.ts` and handled in `handlers/callback.handler.ts`. `gameId` is
 * the **next** occurrence, so the callback needs no series lookup of its own.
 */
export async function sendGameSeriesNextPromptTelegram(
  api: Api,
  payload: {
    telegramId: string;
    language: string;
    title: string;
    body: string;
    gameId: string;
  },
): Promise<boolean> {
  const lang = payload.language || 'en';
  const message = `🔁 ${escapeMarkdown(payload.title)}\n\n${escapeMarkdown(payload.body)}`;

  const buttons = [
    [
      {
        text: seriesT('series.actionImIn', lang),
        callback_data: `sr:${payload.gameId}:accept`,
      },
      {
        text: seriesT('series.actionNotThisTime', lang),
        callback_data: `sr:${payload.gameId}:decline`,
      },
    ],
    [
      {
        text: t('telegram.viewGame', lang),
        url: `${config.frontendUrl}/games/${payload.gameId}`,
      },
    ],
  ];

  const { message: finalMessage, options } = buildMessageWithButtons(message, buttons, lang);
  try {
    await api.sendMessage(payload.telegramId, finalMessage, options);
    return true;
  } catch (error) {
    if (isBenignTelegramRecipientError(error)) return false;
    console.error('[GameSeries] Failed to send next-week Telegram prompt:', error);
    return false;
  }
}
