import { Api } from 'grammy';
import { NotificationChannelType } from '@prisma/client';
import { NotificationPreferenceService, PreferenceKey } from '../../notificationPreference.service';
import { config } from '../../../config/env';
import { t } from '../../../utils/translations';
import { escapeMarkdown, getUserLanguageFromTelegramId, trimTextForTelegram } from '../utils';
import { buildMessageWithButtons } from '../shared/message-builder';
import { isBenignTelegramRecipientError } from '../telegramRecipientErrors';
import { appendTelegramGameScheduleExtras } from '../../shared/notificationSport';
import { buildGameResultsContext } from '../../shared/notification-contexts/game-results.context';

export async function sendGameFinishedNotification(
  api: Api,
  gameId: string,
  userId: string,
  isEdited: boolean = false
) {
  console.log(`[GAME RESULTS NOTIFICATION] Starting notification for user ${userId}, game ${gameId}, isEdited: ${isEdited}`);

  const ctx = await buildGameResultsContext(gameId, userId, isEdited);
  if (!ctx) {
    console.log(`[GAME RESULTS NOTIFICATION] Game ${gameId} not found or has no outcomes for user ${userId}`);
    return;
  }

  const participant = ctx.game.participants.find((p) => p.userId === userId);
  if (!participant?.user.telegramId) {
    console.log(`[GAME RESULTS NOTIFICATION] User ${userId} not eligible`);
    return;
  }

  const allowed = await NotificationPreferenceService.doesUserAllow(userId, NotificationChannelType.TELEGRAM, PreferenceKey.SEND_MESSAGES);
  if (!allowed) {
    console.log(`[GAME RESULTS NOTIFICATION] User ${userId} not eligible`);
    return;
  }

  console.log(`[GAME RESULTS NOTIFICATION] User ${userId} is eligible, preparing message`);
  console.log(`[GAME RESULTS NOTIFICATION] Telegram ID: ${participant.user.telegramId}`);

  const lang = await getUserLanguageFromTelegramId(participant.user.telegramId, undefined);
  const { userOutcome, stats, metadata, gameInfo, game } = ctx;

  let message = `🏁 *${escapeMarkdown(t(ctx.titleKey, lang))}*\n\n`;
  message += `🎮 ${escapeMarkdown(ctx.gameName)}\n`;

  if (ctx.clubName) {
    const placeLine = `📍 ${escapeMarkdown(t('telegram.place', lang))}: ${escapeMarkdown(ctx.clubName)}`;
    message += `${appendTelegramGameScheduleExtras(placeLine, game, game.sport, lang, escapeMarkdown)}\n`;
  }

  message += `🕐 ${escapeMarkdown(t('telegram.time', lang))}: ${gameInfo.shortDayOfWeek} ${gameInfo.shortDate} ${gameInfo.startTime}\n`;

  if (game.entityType !== 'BAR') {
    message += `⏱️ ${escapeMarkdown(t('telegram.duration', lang))}: ${gameInfo.duration}\n`;
  }

  message += `\n📊 *${escapeMarkdown(t('telegram.yourResults', lang))}*\n\n`;

  if (userOutcome.position) {
    message += `🏆 ${escapeMarkdown(t('telegram.finalPlace', lang))}: ${userOutcome.position}\n`;
  }

  const levelChangeStr = userOutcome.levelChange > 0
    ? `+${userOutcome.levelChange.toFixed(2)}`
    : userOutcome.levelChange.toFixed(2);
  message += `📊 ${escapeMarkdown(t('games.level', lang))}: ${userOutcome.levelBefore.toFixed(2)} -> ${userOutcome.levelAfter.toFixed(2)} (${levelChangeStr})\n`;

  if (userOutcome.reliabilityChange !== 0) {
    const reliabilityChangeStr = userOutcome.reliabilityChange > 0
      ? `+${userOutcome.reliabilityChange.toFixed(2)}`
      : userOutcome.reliabilityChange.toFixed(2);
    message += `📈 ${escapeMarkdown(t('telegram.reliabilityChange', lang))}: ${reliabilityChangeStr}\n`;
  }

  message += `📊 ${escapeMarkdown(t('telegram.record', lang))}: ${stats.wins}-${stats.ties}-${stats.losses}\n`;

  if (stats.scoresDelta !== 0) {
    const scoresDeltaStr = stats.scoresDelta > 0
      ? `+${stats.scoresDelta}`
      : `${stats.scoresDelta}`;
    message += `🎯 ${escapeMarkdown(t('telegram.scoresDelta', lang))}: ${scoresDeltaStr}\n`;
  }

  if (metadata.roundsWon !== undefined) {
    message += `🔄 ${escapeMarkdown(t('telegram.roundsWon', lang))}: ${metadata.roundsWon}\n`;
  }

  if (metadata.matchesWon !== undefined) {
    message += `🎾 ${escapeMarkdown(t('telegram.matchesWon', lang))}: ${metadata.matchesWon}\n`;
  }

  if (userOutcome.pointsEarned > 0) {
    message += `💰 ${escapeMarkdown(t('telegram.pointsEarned', lang))}: ${userOutcome.pointsEarned}\n`;
  }

  const buttons = [[
    {
      text: t('telegram.viewGame', lang),
      url: `${config.frontendUrl}/games/${ctx.gameId}`,
    },
  ]];

  const { message: finalMessage, options } = buildMessageWithButtons(message, buttons, lang);
  const trimmedMessage = trimTextForTelegram(finalMessage, false);

  try {
    console.log(`[GAME RESULTS NOTIFICATION] Sending message to telegram ID ${participant.user.telegramId}`);
    await api.sendMessage(participant.user.telegramId, trimmedMessage, options);
    console.log(`[GAME RESULTS NOTIFICATION] Message sent successfully to user ${userId}`);
  } catch (error) {
    if (isBenignTelegramRecipientError(error)) return;
    console.error(`[GAME RESULTS NOTIFICATION] Failed to send Telegram game results notification to user ${userId}:`, error);
  }
}
