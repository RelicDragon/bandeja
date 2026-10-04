/**
 * Time change — "the time changed" over Telegram.
 *
 * Players who are asked to answer again get the same `at:` attendance buttons
 * as the reminder (handled by `handlers/callback.handler.ts`); the owner, whose
 * yes is implicit, only gets "View game".
 *
 * A combined notice for several games of one batch (series "this and following"
 * edit) carries no answer buttons — a callback answers for exactly one game, and
 * "Coming" under a list of dates would be ambiguous. It links to the next
 * affected game (`gameId`) and, for a series, to the series page.
 */
import { Api } from 'grammy';
import { config } from '../../../config/env';
import { t } from '../../../utils/translations';
import { escapeMarkdown } from '../utils';
import { buildMessageWithButtons } from '../shared/message-builder';
import { isBenignTelegramRecipientError } from '../telegramRecipientErrors';
import { guardedTelegramSendMessage } from '../guardedTelegramSend';
import { buildAttendanceCallbackData } from '../../gameAttendance/attendanceRules';
import type { TimeChangeNoticeCopy } from '../../gameTimeChange/timeChangeNoticeCopy';

export interface GameTimeChangedTelegramPayload {
  userId: string;
  telegramId: string;
  language: string;
  gameId: string;
  copy: TimeChangeNoticeCopy;
  asksAttendance: boolean;
  /** Set for a combined notice covering several games; `gameId` is the next one. */
  batch?: { seriesId: string | null; gameCount: number };
}

export async function sendGameTimeChangedTelegram(
  api: Api,
  payload: GameTimeChangedTelegramPayload,
): Promise<boolean> {
  const lang = payload.language || 'en';
  const message = [
    `🕒 ${escapeMarkdown(payload.copy.title)}`,
    '',
    ...payload.copy.lines.map((line) => escapeMarkdown(line)),
  ].join('\n');

  const buttons: { text: string; url?: string; callback_data?: string }[][] = [];
  if (payload.batch) {
    const row: { text: string; url: string }[] = [
      { text: t('timeChange.viewNextGame', lang), url: `${config.frontendUrl}/games/${payload.gameId}` },
    ];
    if (payload.batch.seriesId) {
      row.push({ text: t('timeChange.viewSeries', lang), url: `${config.frontendUrl}/series/${payload.batch.seriesId}` });
    }
    buttons.push(row);
  } else if (payload.asksAttendance) {
    buttons.push([
      {
        text: t('attendance.confirmAction', lang),
        callback_data: buildAttendanceCallbackData(payload.gameId, 'CONFIRMED'),
      },
      {
        text: t('attendance.unsureAction', lang),
        callback_data: buildAttendanceCallbackData(payload.gameId, 'UNSURE'),
      },
    ]);
  }
  if (!payload.batch) {
    buttons.push([
      { text: t('telegram.viewGame', lang), url: `${config.frontendUrl}/games/${payload.gameId}` },
    ]);
  }

  const { message: finalMessage, options } = buildMessageWithButtons(message, buttons, lang);
  try {
    return await guardedTelegramSendMessage(
      api,
      { userId: payload.userId, telegramId: payload.telegramId, kind: 'game-time-changed' },
      () => api.sendMessage(payload.telegramId, finalMessage, options),
    );
  } catch (error) {
    if (!isBenignTelegramRecipientError(error)) {
      console.error('[TimeChange] Failed to send Telegram notice:', error);
    }
    return false;
  }
}
