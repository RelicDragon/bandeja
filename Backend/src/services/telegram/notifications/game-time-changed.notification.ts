/**
 * Time change — "the time changed" over Telegram.
 *
 * Players who are asked to answer again get the same `at:` attendance buttons
 * as the reminder (handled by `handlers/callback.handler.ts`); the owner, whose
 * yes is implicit, only gets "View game".
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
  if (payload.asksAttendance) {
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
  buttons.push([
    { text: t('telegram.viewGame', lang), url: `${config.frontendUrl}/games/${payload.gameId}` },
  ]);

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
