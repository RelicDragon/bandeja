import { Middleware } from 'grammy';
import { BotContext, PendingTelegramInput } from '../types';
import { ChatType } from '@prisma/client';
import prisma from '../../../config/database';
import { config } from '../../../config/env';
import { t } from '../../../utils/translations';
import telegramNotificationService from '../notification.service';
import { acceptInviteFromTelegram, declineInviteFromTelegram } from '../invite.service';
import { acceptUserTeamInviteFromTelegram, declineUserTeamInviteFromTelegram } from '../userTeamInviteTelegram.service';
import { escapeMarkdown, escapeHTML, getUserLanguage } from '../utils';
import { updateInviteTelegramMessage } from '../inviteMessageUpdate';
import { buildMessageWithButtons, isLocalhostUrl } from '../shared/message-builder';
import { parseAttendanceCallbackData } from '../../gameAttendance/attendanceRules';
import { setAttendanceFromAction } from '../../gameAttendance/gameAttendance.service';
import { GameSeriesCarryOverService } from '../../gameSeries/gameSeriesCarryOver.service';
import { seriesT } from '../../gameSeries/gameSeriesCopy';
import { liveT } from '../../live/liveCopy';
import { PlayIntentService } from '../../playIntent/playIntent.service';
import {
  PLAY_TIME_SLOTS,
  buildConfirmationKeyboard,
  buildConfirmationText,
  buildDayKeyboard,
  buildStoppedKeyboard,
  buildTimeKeyboard,
  dayLabel,
  loadPlayCommandUser,
  parsePlayCallback,
  summaryFromIntent,
} from '../commands/play.command';
import { keepAsPlannedFromAction } from '../../weather/weatherAlert.service';
import { weatherT } from '../../weather/weatherAlertCopy';
export function createCallbackHandler(
  pendingReplies: Map<string, PendingTelegramInput>
): Middleware<BotContext> {
  return async (ctx) => {
    const query = ctx.callbackQuery;
    if (!query?.data || !ctx.from || !ctx.telegramId) {
      await ctx.answerCallbackQuery({ text: 'Invalid request', show_alert: true });
      return;
    }

    try {
      if (query.data.startsWith('ia:')) {
        const parts = query.data.split(':');
        if (parts.length !== 3) {
          await ctx.answerCallbackQuery({ text: 'Invalid request', show_alert: true });
          return;
        }

        const [, inviteId, action] = parts;
        const telegramId = ctx.telegramId;

        if (action !== 'accept' && action !== 'decline' && action !== 'decline_r') {
          await ctx.answerCallbackQuery({ text: 'Invalid action', show_alert: true });
          return;
        }

        const user = await prisma.user.findUnique({
          where: { telegramId },
          select: {
            id: true,
            language: true,
          }
        });

        if (!user) {
          await ctx.answerCallbackQuery({
            text: 'Unauthorized',
            show_alert: true
          });
          return;
        }

        const lang = getUserLanguage(user.language, ctx.from?.language_code);

        if (action === 'decline_r') {
          if (
            !query.message ||
            !('text' in query.message) ||
            !query.message.text ||
            !query.message.chat ||
            !('id' in query.message.chat) ||
            typeof query.message.chat.id !== 'number'
          ) {
            await ctx.answerCallbackQuery({
              text: t('telegram.inviteActionError', lang),
              show_alert: true
            });
            return;
          }

          const participant = await prisma.gameParticipant.findUnique({
            where: { id: inviteId },
            select: { status: true, userId: true },
          });
          if (
            !participant ||
            participant.status !== 'INVITED' ||
            participant.userId !== user.id
          ) {
            await ctx.answerCallbackQuery({
              text: t('errors.invites.notFound', lang) || t('telegram.inviteActionError', lang),
              show_alert: true
            });
            return;
          }

          pendingReplies.set(telegramId, {
            kind: 'decline_invite',
            inviteId,
            userId: user.id,
            lang,
            inviteMessageChatId: query.message.chat.id,
            inviteMessageId: query.message.message_id,
            inviteMessageText: query.message.text,
            inviteReplyMarkup: query.message.reply_markup
              ? { inline_keyboard: query.message.reply_markup.inline_keyboard as unknown[] }
              : undefined,
            createdAt: Date.now(),
          });

          await ctx.answerCallbackQuery();
          await ctx.api.sendMessage(
            query.message.chat.id,
            t('telegram.declineInviteReasonPrompt', lang)
          );
          return;
        }

        // Accept / plain decline: drop any in-flight "decline with response" prompt
        pendingReplies.delete(telegramId);

        const result = action === 'accept'
          ? await acceptInviteFromTelegram(inviteId, user.id)
          : await declineInviteFromTelegram(inviteId, user.id);

        let feedbackMessage: string;
        if (result.success) {
          feedbackMessage = t(result.message, lang);
        } else {
          feedbackMessage = t(result.message, lang) || t('telegram.inviteActionError', lang);
        }

        await ctx.answerCallbackQuery({
          text: feedbackMessage,
          show_alert: true
        });

        if (query.message && 'text' in query.message && query.message.text && query.message.chat) {
          const chat = query.message.chat;
          if ('id' in chat && typeof chat.id === 'number') {
            const statusText = result.success
              ? (action === 'accept'
                ? t('telegram.inviteAccepted', lang)
                : t('telegram.inviteDeclined', lang))
              : (t(result.message, lang) || t('telegram.inviteActionError', lang));

            try {
              await updateInviteTelegramMessage({
                api: ctx.api,
                chatId: chat.id,
                messageId: query.message.message_id,
                originalText: query.message.text,
                statusLine: statusText,
                success: result.success,
                replyMarkup: query.message.reply_markup
                  ? { inline_keyboard: query.message.reply_markup.inline_keyboard as unknown[] }
                  : undefined,
              });
            } catch (editError) {
              console.error('Failed to edit invite message:', editError);
            }
          }
        }
      } else if (query.data.startsWith('sr:')) {
        // PRD 345 — "Same time next week?" The id is the NEXT occurrence's game.
        const parts = query.data.split(':');
        if (parts.length !== 3 || (parts[2] !== 'accept' && parts[2] !== 'decline')) {
          await ctx.answerCallbackQuery({ text: 'Invalid request', show_alert: true });
          return;
        }
        const [, seriesGameId, seriesAction] = parts;
        const seriesUser = await prisma.user.findUnique({
          where: { telegramId: ctx.telegramId },
          select: { id: true, language: true },
        });
        if (!seriesUser) {
          await ctx.answerCallbackQuery({ text: 'Invalid request', show_alert: true });
          return;
        }
        const seriesLang = getUserLanguage(seriesUser.language, ctx.from?.language_code);
        const seriesResult =
          seriesAction === 'accept'
            ? await GameSeriesCarryOverService.acceptSeat(seriesUser.id, seriesGameId)
            : await GameSeriesCarryOverService.declineSeat(seriesUser.id, seriesGameId);
        const seriesFeedback = seriesResult.success
          ? seriesT(
              seriesAction === 'accept' ? 'series.seatKept' : 'series.seatReleased',
              seriesLang,
            )
          : seriesT('series.promptExpired', seriesLang);
        await ctx.answerCallbackQuery({ text: seriesFeedback, show_alert: true });
      } else if (query.data.startsWith('uti:')) {
        const parts = query.data.split(':');
        if (parts.length !== 3) {
          await ctx.answerCallbackQuery({ text: 'Invalid request', show_alert: true });
          return;
        }

        const [, teamId, action] = parts;
        const telegramId = ctx.telegramId;

        if (action !== 'accept' && action !== 'decline') {
          await ctx.answerCallbackQuery({ text: 'Invalid action', show_alert: true });
          return;
        }

        const user = await prisma.user.findUnique({
          where: { telegramId },
          select: {
            id: true,
            language: true,
          }
        });

        if (!user) {
          await ctx.answerCallbackQuery({
            text: 'Unauthorized',
            show_alert: true
          });
          return;
        }

        const lang = getUserLanguage(user.language, ctx.from?.language_code);

        const result = action === 'accept'
          ? await acceptUserTeamInviteFromTelegram(teamId, user.id)
          : await declineUserTeamInviteFromTelegram(teamId, user.id);

        let feedbackMessage: string;
        if (result.success) {
          feedbackMessage = t(result.message, lang);
        } else {
          feedbackMessage = t(result.message, lang) || t('telegram.teamInviteActionError', lang);
        }

        await ctx.answerCallbackQuery({
          text: feedbackMessage,
          show_alert: true
        });

        if (query.message && 'text' in query.message && query.message.text && query.message.chat) {
          const chat = query.message.chat;
          if ('id' in chat && typeof chat.id === 'number') {
            const originalMessage = query.message.text;
            const isHTML = originalMessage.includes('<') && originalMessage.includes('>');
            const parseMode = isHTML ? 'HTML' : 'Markdown';
            const escapeFunction = isHTML ? escapeHTML : escapeMarkdown;

            let updatedMessage: string;
            let statusText: string;

            if (result.success) {
              statusText = action === 'accept'
                ? t('telegram.teamInviteAccepted', lang)
                : t('telegram.teamInviteDeclined', lang);

              let cleanedMessage = originalMessage.replace(/^(✅|❌)[^\n]*(?:\n\n?)?/s, '');
              cleanedMessage = cleanedMessage.replace(/^🎯[^\n]*(?:\n\n?)?/s, '');
              cleanedMessage = cleanedMessage.replace(/^👥[^\n]*(?:\n\n?)?/s, '');
              updatedMessage = escapeFunction('✅ ' + statusText) + '\n\n' + cleanedMessage.trim();
            } else {
              const errorText = t(result.message, lang) || t('telegram.teamInviteActionError', lang);
              let cleanedMessage = originalMessage.replace(/^(✅|❌)[^\n]*(?:\n\n?)?/s, '');
              updatedMessage = escapeFunction('❌ ' + errorText) + '\n\n' + cleanedMessage.trim();
            }

            try {
              const newReplyMarkup = result.success ? { inline_keyboard: [] } : query.message.reply_markup;
              const hasContentChanged = originalMessage !== updatedMessage;
              const hasMarkupChanged = result.success && query.message.reply_markup &&
                JSON.stringify(query.message.reply_markup) !== JSON.stringify(newReplyMarkup);

              if (hasContentChanged || hasMarkupChanged) {
                await ctx.api.editMessageText(chat.id, query.message.message_id, updatedMessage, {
                  parse_mode: parseMode,
                  reply_markup: newReplyMarkup
                });
              }
            } catch (editError) {
              console.error('Failed to edit team invite message:', editError);
            }
          }
        }
      } else if (query.data.startsWith('at:')) {
        // PRD 346 — attendance answer from the reminder message.
        // Informative only: nothing here changes a seat or a queue position.
        const parsed = parseAttendanceCallbackData(query.data);
        if (!parsed) {
          await ctx.answerCallbackQuery({ text: 'Invalid request', show_alert: true });
          return;
        }

        const user = await prisma.user.findUnique({
          where: { telegramId: ctx.telegramId },
          select: { id: true, language: true },
        });

        if (!user) {
          await ctx.answerCallbackQuery({ text: 'Unauthorized', show_alert: true });
          return;
        }

        const lang = getUserLanguage(user.language, ctx.from?.language_code);
        const saved = await setAttendanceFromAction(user.id, parsed.gameId, parsed.answer);

        if (!saved) {
          await ctx.answerCallbackQuery({
            text: t('errors.attendance.notParticipant', lang),
            show_alert: true,
          });
          return;
        }

        const statusText =
          parsed.answer === 'CONFIRMED'
            ? t('attendance.telegramConfirmed', lang)
            : t('attendance.telegramUnsure', lang);

        await ctx.answerCallbackQuery({ text: statusText });

        if (query.message && 'text' in query.message && query.message.text && query.message.chat) {
          const chat = query.message.chat;
          if ('id' in chat && typeof chat.id === 'number') {
            const originalMessage = query.message.text;
            const isHTML = originalMessage.includes('<') && originalMessage.includes('>');
            const parseMode = isHTML ? 'HTML' : 'Markdown';
            const escapeFunction = isHTML ? escapeHTML : escapeMarkdown;
            const cleanedMessage = originalMessage.replace(/^(✅|🤔)[^\n]*(?:\n\n?)?/s, '');
            const updatedMessage =
              escapeFunction(statusText) + '\n\n' + cleanedMessage.trim();

            try {
              // Keep the "View game" row, drop the two answer buttons.
              const keptRows = (query.message.reply_markup?.inline_keyboard ?? []).filter(
                (row) => !row.some((button) => 'callback_data' in button && typeof button.callback_data === 'string' && button.callback_data.startsWith('at:')),
              );
              await ctx.api.editMessageText(chat.id, query.message.message_id, updatedMessage, {
                parse_mode: parseMode,
                reply_markup: { inline_keyboard: keptRows },
              });
            } catch (editError) {
              console.error('Failed to edit attendance reminder message:', editError);
            }
          }
        }
      } else if (query.data.startsWith('sg:')) {
        const parts = query.data.split(':');
        if (parts.length !== 3) {
          await ctx.answerCallbackQuery({ text: 'Invalid request', show_alert: true });
          return;
        }

        const [, gameId, userId] = parts;
        const telegramId = ctx.telegramId;

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            telegramId: true,
            language: true,
          }
        });

        if (user?.telegramId === telegramId) {
          const lang = getUserLanguage(user.language, ctx.from?.language_code);
          try {
            await ctx.answerCallbackQuery({
              text: 'Loading game...',
              show_alert: false
            });
            await telegramNotificationService.sendGameCard(gameId, telegramId, ctx.api);
          } catch (error) {
            console.error('Error sending game card:', error);
            try {
              await ctx.answerCallbackQuery({
                text: 'Failed to load game. Please try again.',
                show_alert: true
              });
            } catch {
              if (query.message && 'chat' in query.message && query.message.chat) {
                const chat = query.message.chat;
                if ('id' in chat && typeof chat.id === 'number') {
                  await ctx.api.sendMessage(
                    chat.id,
                    t('telegram.errorLoadingGame', lang) || 'Failed to load game. Please try again.'
                  );
                }
              }
            }
          }
        } else {
          await ctx.answerCallbackQuery({
            text: 'Unauthorized',
            show_alert: true
          });
        }
      } else if (query.data.startsWith('pi:')) {
        /*
         * PRD 356 — the `/play` wizard. Every step edits the same message, and
         * all the state travels in the callback data, so a bot restart between
         * two taps cannot strand the user mid-flow.
         */
        const parsed = parsePlayCallback(query.data);
        if (!parsed) {
          await ctx.answerCallbackQuery({ text: 'Invalid request', show_alert: true });
          return;
        }

        const playUser = await loadPlayCommandUser(ctx.telegramId);
        if (!playUser) {
          await ctx.answerCallbackQuery({ text: 'Unauthorized', show_alert: true });
          return;
        }

        const playLang = getUserLanguage(playUser.language, ctx.from?.language_code);

        if (!playUser.city || !playUser.primarySport) {
          await ctx.answerCallbackQuery({
            text: liveT('play.needCity', playLang),
            show_alert: true,
          });
          return;
        }
        const playCity = playUser.city;
        const playSport = playUser.primarySport;

        if (parsed.kind === 'day') {
          await ctx.answerCallbackQuery();
          await ctx.editMessageText(
            liveT('play.askTime', playLang, {
              day: dayLabel(parsed.dayOffset, playLang, playCity.timezone),
            }),
            { reply_markup: buildTimeKeyboard(playLang, parsed.dayOffset) },
          );
          return;
        }

        if (parsed.kind === 'back' || parsed.kind === 'again') {
          await ctx.answerCallbackQuery();
          await ctx.editMessageText(liveT('play.askWhen', playLang), {
            reply_markup: buildDayKeyboard(playLang, playCity.timezone),
          });
          return;
        }

        if (parsed.kind === 'time') {
          const intent = await PlayIntentService.createOrReplace(playUser.id, {
            cityId: playCity.id,
            sport: playSport,
            dayOffsets: [parsed.dayOffset],
            timeOfDays: [PLAY_TIME_SLOTS[parsed.slot]],
          });
          await ctx.answerCallbackQuery();
          await ctx.editMessageText(
            buildConfirmationText(summaryFromIntent(intent, playCity), playLang),
            {
              parse_mode: 'Markdown',
              // Fresh intent → "Cancel"; `/play` on an existing one says
              // "Stop looking" instead (PRD 356).
              reply_markup: buildConfirmationKeyboard(playLang, 'play.cancel'),
            },
          );
          return;
        }

        if (parsed.kind === 'cancel') {
          try {
            await PlayIntentService.cancel(playUser.id);
          } catch {
            // Already cancelled, expired or consumed — the message still needs
            // to stop claiming the user is looking.
          }
          await ctx.answerCallbackQuery();
          await ctx.editMessageText(liveT('play.stoppedLooking', playLang), {
            reply_markup: buildStoppedKeyboard(playLang),
          });
          return;
        }

        // parsed.kind === 'join' — the group card's "I'm in too".
        const posterIntent = await prisma.playIntent.findUnique({
          where: { id: parsed.intentId },
          select: { dateKeys: true, timeOfDays: true, timeOfDay: true },
        });
        if (!posterIntent) {
          await ctx.answerCallbackQuery({
            text: liveT('play.expired', playLang),
            show_alert: true,
          });
          return;
        }

        const mirroredPeriods = posterIntent.timeOfDays.length
          ? posterIntent.timeOfDays
          : [posterIntent.timeOfDay];
        const joinedIntent = await PlayIntentService.createOrReplace(playUser.id, {
          cityId: playCity.id,
          sport: playSport,
          // The tapper's own city timezone decides which keys are still
          // reachable; unreachable ones are dropped by resolveDateKeys.
          dateKeys: posterIntent.dateKeys,
          timeOfDays: mirroredPeriods,
        });

        await ctx.answerCallbackQuery({ text: liveT('play.groupJoined', playLang) });
        try {
          await ctx.api.sendMessage(
            Number(ctx.telegramId),
            buildConfirmationText(summaryFromIntent(joinedIntent, playCity), playLang),
            {
              parse_mode: 'Markdown',
              reply_markup: buildConfirmationKeyboard(playLang, 'play.cancel'),
            },
          );
        } catch (dmError) {
          // The tapper has never opened a chat with the bot; the callback
          // toast above is the only confirmation they get.
          console.error('Error confirming play intent privately:', dmError);
        }
      } else if (query.data.startsWith('sip:')) {
        const parts = query.data.split(':');
        if (parts.length !== 3) {
          await ctx.answerCallbackQuery({ text: 'Invalid request', show_alert: true });
          return;
        }

        const [, proposalId, userId] = parts;
        const telegramId = ctx.telegramId;

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { telegramId: true, language: true },
        });

        if (user?.telegramId !== telegramId) {
          await ctx.answerCallbackQuery({ text: 'Unauthorized', show_alert: true });
          return;
        }

        const membership = await prisma.matchProposalMember.findFirst({
          where: { proposalId, userId },
          select: { id: true },
        });
        if (!membership) {
          await ctx.answerCallbackQuery({
            text: t('telegram.matchNotFound', user.language || 'en') || 'Match not found',
            show_alert: true,
          });
          return;
        }

        const lang = getUserLanguage(user.language, ctx.from?.language_code);
        const deepLink = `${config.frontendUrl}/find?proposal=${proposalId}`;

        try {
          if (!isLocalhostUrl(config.frontendUrl)) {
            await ctx.answerCallbackQuery({ url: deepLink });
            return;
          }

          await ctx.answerCallbackQuery({
            text: t('telegram.openingMatch', lang) || 'Opening match…',
            show_alert: false,
          });

          const proposal = await prisma.matchProposal.findUnique({
            where: { id: proposalId },
            include: {
              members: {
                include: { user: { select: { firstName: true } } },
              },
            },
          });
          if (!proposal) return;

          const names = proposal.members
            .map((m) => m.user.firstName || '—')
            .filter(Boolean)
            .join(', ');
          const when = [proposal.dateKeys.join(', '), proposal.startTime, proposal.endTime]
            .filter(Boolean)
            .join(' · ');
          const card = [
            `🎾 ${escapeMarkdown(t('playIntent.matchTitle', lang) || 'Players ready to play')}`,
            names ? `👥 ${escapeMarkdown(names)}` : null,
            when ? `📅 ${escapeMarkdown(when)}` : null,
            escapeMarkdown(t('playIntent.matchBody', lang) || 'Open to form a game together'),
          ]
            .filter(Boolean)
            .join('\n\n');

          const { message: finalMessage, options } = buildMessageWithButtons(
            card,
            [[{ text: t('telegram.viewMatch', lang) || 'View match', url: deepLink }]],
            lang,
          );

          if (query.message && 'chat' in query.message && query.message.chat && 'id' in query.message.chat) {
            await ctx.api.sendMessage(query.message.chat.id, finalMessage, options);
          }
        } catch (error) {
          console.error('Error opening play-intent match:', error);
          try {
            await ctx.answerCallbackQuery({
              text: t('telegram.errorLoadingMatch', lang) || 'Failed to open match',
              show_alert: true,
            });
          } catch {
            /* already answered */
          }
        }
      } else if (query.data.startsWith('wx:')) {
        // PRD 357 — "Keep as planned" from the weather alert. Suppresses the
        // 2 h follow-up; never touches the roster, the time or the courts.
        const parts = query.data.split(':');
        if (parts.length !== 3 || parts[2] !== 'keep') {
          await ctx.answerCallbackQuery({ text: 'Invalid request', show_alert: true });
          return;
        }

        const [, weatherGameId] = parts;
        const weatherUser = await prisma.user.findUnique({
          where: { telegramId: ctx.telegramId },
          select: { id: true, language: true },
        });
        if (!weatherUser) {
          await ctx.answerCallbackQuery({ text: 'Unauthorized', show_alert: true });
          return;
        }

        const weatherLang = getUserLanguage(weatherUser.language, ctx.from?.language_code);
        const kept = await keepAsPlannedFromAction(weatherUser.id, weatherGameId);
        await ctx.answerCallbackQuery({
          text: weatherT(kept ? 'weather.keptAsPlanned' : 'weather.keepFailed', weatherLang),
          show_alert: true,
        });

        if (kept && query.message && 'chat' in query.message && query.message.chat) {
          const chat = query.message.chat;
          if ('id' in chat && typeof chat.id === 'number') {
            try {
              // Drop the now-meaningless "Keep as planned" button, keep the links.
              const keptRows = (query.message.reply_markup?.inline_keyboard ?? []).map((row) =>
                row.filter(
                  (button) =>
                    !(
                      'callback_data' in button &&
                      typeof button.callback_data === 'string' &&
                      button.callback_data.startsWith('wx:')
                    ),
                ),
              ).filter((row) => row.length > 0);
              await ctx.api.editMessageReplyMarkup(chat.id, query.message.message_id, {
                reply_markup: { inline_keyboard: keptRows },
              });
            } catch (editError) {
              console.error('Failed to edit weather alert message:', editError);
            }
          }
        }
      } else if (query.data.startsWith('rm:')) {
        const parts = query.data.split(':');
        if (parts.length !== 4) {
          await ctx.answerCallbackQuery({ text: 'Invalid request', show_alert: true });
          return;
        }

        const [, messageId, gameId, chatTypeChar] = parts;
        const telegramId = ctx.telegramId;

        const chatTypeMap: Record<string, ChatType> = {
          'P': 'PUBLIC',
          'V': 'PRIVATE',
          'A': 'ADMINS',
          'F': 'PUBLIC'
        };
        const chatType = chatTypeMap[chatTypeChar] || 'PUBLIC';

        const user = await prisma.user.findUnique({
          where: { telegramId },
          select: {
            id: true,
            language: true,
          }
        });

        if (!user) {
          await ctx.answerCallbackQuery({
            text: 'Unauthorized',
            show_alert: true
          });
          return;
        }

        await ctx.answerCallbackQuery();

        const lang = getUserLanguage(user.language, ctx.from?.language_code);
        pendingReplies.set(telegramId, {
          kind: 'reply',
          messageId,
          gameId,
          userId: user.id,
          chatType,
          chatContextType: 'GAME',
          lang
        });

        if (query.message && 'chat' in query.message && query.message.chat) {
          const chat = query.message.chat;
          if ('id' in chat && typeof chat.id === 'number') {
            await ctx.api.sendMessage(
              chat.id,
              t('telegram.replyPrompt', lang)
            );
          }
        }
      } else if (query.data.startsWith('rum:')) {
        const parts = query.data.split(':');
        if (parts.length !== 3) {
          await ctx.answerCallbackQuery({ text: 'Invalid request', show_alert: true });
          return;
        }

        const [, messageId, userChatId] = parts;
        const telegramId = ctx.telegramId;

        const user = await prisma.user.findUnique({
          where: { telegramId },
          select: {
            id: true,
            language: true,
          }
        });

        if (!user) {
          await ctx.answerCallbackQuery({
            text: 'Unauthorized',
            show_alert: true
          });
          return;
        }

        await ctx.answerCallbackQuery();

        const lang = getUserLanguage(user.language, ctx.from?.language_code);
        pendingReplies.set(telegramId, {
          kind: 'reply',
          messageId,
          userChatId,
          userId: user.id,
          chatType: 'PUBLIC',
          chatContextType: 'USER',
          lang
        });

        if (query.message && 'chat' in query.message && query.message.chat) {
          const chat = query.message.chat;
          if ('id' in chat && typeof chat.id === 'number') {
            await ctx.api.sendMessage(
              chat.id,
              t('telegram.replyPrompt', lang)
            );
          }
        }
      } else if (query.data.startsWith('rg:')) {
        const parts = query.data.split(':');
        if (parts.length !== 3) {
          await ctx.answerCallbackQuery({ text: 'Invalid request', show_alert: true });
          return;
        }

        const [, messageId, groupChannelId] = parts;
        const telegramId = ctx.telegramId;

        const user = await prisma.user.findUnique({
          where: { telegramId },
          select: {
            id: true,
            language: true,
          }
        });

        if (!user) {
          await ctx.answerCallbackQuery({
            text: 'Unauthorized',
            show_alert: true
          });
          return;
        }

        const groupChannel = await prisma.groupChannel.findUnique({
          where: { id: groupChannelId },
          include: {
            participants: {
              where: { userId: user.id }
            }
          }
        });

        const participant = groupChannel?.participants[0];
        const canWrite = groupChannel
          ? (groupChannel.isChannel
            ? participant && (participant.role === 'OWNER' || participant.role === 'ADMIN')
            : !!participant)
          : false;

        if (!canWrite) {
          await ctx.answerCallbackQuery({
            text: 'You do not have permission to reply to this chat.',
            show_alert: true
          });
          return;
        }

        await ctx.answerCallbackQuery();

        const lang = getUserLanguage(user.language, ctx.from?.language_code);
        pendingReplies.set(telegramId, {
          kind: 'reply',
          messageId,
          groupChannelId,
          userId: user.id,
          chatType: 'PUBLIC',
          chatContextType: 'GROUP',
          lang
        });

        if (query.message && 'chat' in query.message && query.message.chat) {
          const chat = query.message.chat;
          if ('id' in chat && typeof chat.id === 'number') {
            await ctx.api.sendMessage(
              chat.id,
              t('telegram.replyPrompt', lang)
            );
          }
        }
      } else if (query.data.startsWith('rbm:')) {
        const parts = query.data.split(':');
        if (parts.length !== 3) {
          await ctx.answerCallbackQuery({ text: 'Invalid request', show_alert: true });
          return;
        }

        const [, messageId, bugId] = parts;
        const telegramId = ctx.telegramId;

        const user = await prisma.user.findUnique({
          where: { telegramId },
          select: {
            id: true,
            language: true,
          }
        });

        if (!user) {
          await ctx.answerCallbackQuery({
            text: 'Unauthorized',
            show_alert: true
          });
          return;
        }

        await ctx.answerCallbackQuery();

        const lang = getUserLanguage(user.language, ctx.from?.language_code);
        pendingReplies.set(telegramId, {
          kind: 'reply',
          messageId,
          bugId,
          userId: user.id,
          chatType: 'PUBLIC',
          chatContextType: 'BUG',
          lang
        });

        if (query.message && 'chat' in query.message && query.message.chat) {
          const chat = query.message.chat;
          if ('id' in chat && typeof chat.id === 'number') {
            await ctx.api.sendMessage(
              chat.id,
              t('telegram.replyPrompt', lang)
            );
          }
        }
      } else {
        // Registered in bot.service.ts but not implemented here yet (or an
        // unknown prefix). Close the spinner instead of letting grammy's
        // catch-all show the generic error alert.
        await ctx.answerCallbackQuery();
      }
    } catch (error) {
      console.error('Error handling callback query:', error);
      await ctx.answerCallbackQuery({
        text: 'An error occurred',
        show_alert: true
      });
    }
  };
}
