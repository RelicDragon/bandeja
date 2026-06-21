import { Api } from 'grammy';
import prisma from '../../../config/database';
import { ChatType, ChatContextType } from '@prisma/client';
import { NotificationPreferenceService } from '../../notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';
import { PreferenceKey } from '../../../types/notifications.types';
import { escapeMarkdown, getUserLanguageFromTelegramId, trimTextForTelegram } from '../utils';
import { buildMessageWithButtons } from '../shared/message-builder';
import {
  formatGameContextHeader,
  formatGameInfoForUser,
  getEntityTypeLabel,
  getShowEntityButtonText,
} from '../../shared/notification-base';
import { appendTelegramGameScheduleExtras } from '../../shared/notificationSport';
import { ChatMuteService } from '../../chat/chatMute.service';
import { canParticipantSeeGameChatMessage } from '../../chat/gameChatVisibility';
import { isBenignTelegramRecipientError } from '../telegramRecipientErrors';
import { guardedTelegramSendMessage } from '../guardedTelegramSend';
import { translateSystemMessageContent } from '../../../utils/translateSystemMessageContent';

export async function sendGameSystemMessageNotification(
  api: Api,
  message: any,
  game: any
) {

  const chatType = message.chatType as ChatType;
  const participants = await prisma.gameParticipant.findMany({
    where: { gameId: game.id },
    include: {
      user: {
        select: {
          id: true,
          telegramId: true,
          language: true,
          currentCityId: true,
          primarySport: true,
        }
      }
    }
  });

  for (const participant of participants) {
    const user = participant.user;
    const allowed = await NotificationPreferenceService.doesUserAllow(user.id, NotificationChannelType.TELEGRAM, PreferenceKey.SEND_MESSAGES);
    if (!allowed || !user.telegramId) continue;
    const telegramId = user.telegramId;

    const isMuted = await ChatMuteService.isChatMuted(user.id, ChatContextType.GAME, game.id);
    if (isMuted) {
      continue;
    }

    const canSeeMessage = canParticipantSeeGameChatMessage(participant, game, chatType);

    if (canSeeMessage) {
      try {
        const lang = await getUserLanguageFromTelegramId(user.telegramId, undefined);
        const gameInfo = await formatGameInfoForUser(game, user.currentCityId, lang);
        const translatedContent = translateSystemMessageContent(message, lang, game.entityType);
        const entityLabel = getEntityTypeLabel(game.entityType, lang);
        const showButtonText = getShowEntityButtonText(game.entityType, lang);

        const scheduleLine = appendTelegramGameScheduleExtras(
          `📍 ${escapeMarkdown(formatGameContextHeader(gameInfo))}`,
          game,
          user.primarySport,
          lang,
          escapeMarkdown,
        );
        const header = entityLabel
          ? `🏷️ ${escapeMarkdown(entityLabel)}\n${scheduleLine}`
          : scheduleLine;
        const formattedMessage = `${header}\n🔔 ${escapeMarkdown(translatedContent)}`;
        
        const buttons = [[
          {
            text: showButtonText,
            callback_data: `sg:${game.id}:${user.id}`
          }
        ]];

        const { message: finalMessage, options } = buildMessageWithButtons(formattedMessage, buttons, lang);
        const trimmedMessage = trimTextForTelegram(finalMessage, false);
        
        await guardedTelegramSendMessage(
          api,
          { userId: user.id, telegramId, kind: 'game-system-message' },
          () => api.sendMessage(telegramId, trimmedMessage, options),
        );
      } catch (error) {
        if (!isBenignTelegramRecipientError(error)) {
          console.error(`Failed to send Telegram notification to user ${user.id}:`, error);
        }
      }
    }
  }
}

