import { Api, InputFile } from 'grammy';
import { t } from '../../../utils/translations';
import { escapeMarkdown, getUserLanguageFromTelegramId } from '../utils';
import { buildMessageWithButtons } from '../shared/message-builder';
import { NotificationPreferenceService } from '../../notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';
import { PreferenceKey } from '../../../types/notifications.types';
import { isBenignTelegramRecipientError } from '../telegramRecipientErrors';
import { buildLeagueBracketScheduleUrl } from '../../league/leagueBracketDeepLink.util';
import type { BracketScopeDto } from '../../league/leagueBracketDeepLink.util';

export type BracketRoundSummaryPayload = {
  leagueSeasonId: string;
  leagueName: string;
  bracketScope: BracketScopeDto;
  leagueGroupId: string | null;
  championLabel: string;
  finalistLabel: string;
  thirdPlaceLabel?: string;
};

export async function sendBracketRoundSummaryNotification(
  api: Api,
  user: { id: string; telegramId: string | null; language?: string | null },
  payload: BracketRoundSummaryPayload,
  imagePng?: Buffer
): Promise<void> {
  const allowed = await NotificationPreferenceService.doesUserAllow(
    user.id,
    NotificationChannelType.TELEGRAM,
    PreferenceKey.SEND_MESSAGES
  );
  if (!allowed || !user.telegramId) return;

  const lang = await getUserLanguageFromTelegramId(user.telegramId, user.language ?? undefined);

  const lines = [
    `🏆 *${escapeMarkdown(payload.leagueName)}*`,
    '',
    `🥇 ${escapeMarkdown(t('telegram.bracketSummaryChampion', lang))}: *${escapeMarkdown(payload.championLabel)}*`,
    `🥈 ${escapeMarkdown(t('telegram.bracketSummaryFinalist', lang))}: *${escapeMarkdown(payload.finalistLabel)}*`,
  ];
  if (payload.thirdPlaceLabel) {
    lines.push(
      `🥉 ${escapeMarkdown(t('telegram.bracketSummaryThird', lang))}: *${escapeMarkdown(payload.thirdPlaceLabel)}*`
    );
  }

  const message = `🏁 ${escapeMarkdown(t('telegram.bracketSummaryTitle', lang))}\n\n${lines.join('\n')}`;
  const viewUrl = buildLeagueBracketScheduleUrl(payload.leagueSeasonId, {
    bracketScope: payload.bracketScope,
    leagueGroupId: payload.leagueGroupId,
  });
  const buttons = [[{ text: t('telegram.viewBracket', lang), url: viewUrl }]];
  const { message: finalMessage, options } = buildMessageWithButtons(message, buttons, lang);

  try {
    if (imagePng?.length) {
      await api.sendPhoto(user.telegramId, new InputFile(imagePng, 'bracket-summary.png'), {
        caption: finalMessage,
        parse_mode: options.parse_mode,
        reply_markup: options.reply_markup,
      });
    } else {
      await api.sendMessage(user.telegramId, finalMessage, options);
    }
  } catch (error) {
    if (isBenignTelegramRecipientError(error)) return;
    console.error(`Failed to send bracket summary Telegram to user ${user.id}:`, error);
  }
}
