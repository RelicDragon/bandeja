import { Api } from 'grammy';
import prisma from '../../../config/database';
import { ChatType, ChatContextType } from '@prisma/client';
import { t } from '../../../utils/translations';
import { escapeMarkdown, getUserLanguageFromTelegramId, trimTextForTelegram } from '../utils';
import { buildMessageWithButtons } from '../shared/message-builder';
import { formatGameInfoForUser, formatUserName, getEntityTypeLabel, getShowEntityButtonText } from '../../shared/notification-base';
import { ChatMuteService } from '../../chat/chatMute.service';
import { canParticipantSeeGameChatMessage } from '../../chat/gameChatVisibility';
import { NotificationPreferenceService } from '../../notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';
import { PreferenceKey } from '../../../types/notifications.types';

export async function sendGameChatNotification(
  api: Api,
  message: any,
  game: any,
  sender: any
) {
  const senderName = formatUserName(sender);
  const messageContent = message.content || '[Media]';

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
        }
      }
    }
  });

  const mentionIds = message.mentionIds || [];
  const hasMentions = mentionIds.length > 0;
  const mentionedUserIds = hasMentions ? new Set(mentionIds) : null;
  const currentGameUserIds = new Set(participants.map(p => p.user.id));

  for (const participant of participants) {
    const user = participant.user;
    if (user.id === sender.id) continue;
    const allowed = await NotificationPreferenceService.doesUserAllow(user.id, NotificationChannelType.TELEGRAM, PreferenceKey.SEND_MESSAGES);
    if (!allowed || !user.telegramId) continue;

    if (hasMentions) {
      if (!mentionedUserIds?.has(user.id)) {
        continue;
      }
    } else {
      const isMuted = await ChatMuteService.isChatMuted(user.id, ChatContextType.GAME, game.id);
      if (isMuted) {
        continue;
      }
    }

    const canSeeMessage = canParticipantSeeGameChatMessage(participant, game, chatType);

    if (canSeeMessage) {
      try {
        const lang = await getUserLanguageFromTelegramId(user.telegramId, undefined);
        const gameInfo = await formatGameInfoForUser(game, user.currentCityId, lang);
        const entityLabel = getEntityTypeLabel(game.entityType, lang);
        const showButtonText = getShowEntityButtonText(game.entityType, lang);

        const header = entityLabel
          ? `🏷️ ${escapeMarkdown(entityLabel)}\n📍 ${escapeMarkdown(gameInfo.place)} ${gameInfo.shortDayOfWeek} ${gameInfo.shortDate} ${gameInfo.startTime}, ${gameInfo.duration}`
          : `📍 ${escapeMarkdown(gameInfo.place)} ${gameInfo.shortDayOfWeek} ${gameInfo.shortDate} ${gameInfo.startTime}, ${gameInfo.duration}`;
        const formattedMessage = `${header}\n👤 *${escapeMarkdown(senderName)}*: ${escapeMarkdown(messageContent)}`;
        
        const chatTypeChar = { [ChatType.PUBLIC]: 'P', [ChatType.PRIVATE]: 'V', [ChatType.ADMINS]: 'A', [ChatType.PHOTOS]: 'F' }[chatType] ?? 'P';
        
        const buttons = [[
          {
            text: showButtonText,
            callback_data: `sg:${game.id}:${user.id}`
          },
          {
            text: t('telegram.reply', lang),
            callback_data: `rm:${message.id}:${game.id}:${chatTypeChar}`
          }
        ]];

        const { message: finalMessage, options } = buildMessageWithButtons(formattedMessage, buttons, lang);
        const trimmedMessage = trimTextForTelegram(finalMessage, false);
        
        await api.sendMessage(user.telegramId, trimmedMessage, options);
      } catch (error) {
        console.error(`Failed to send Telegram notification to user ${user.id}:`, error);
      }
    }
  }

  const gameWithParent = await prisma.game.findUnique({
    where: { id: game.id },
    select: { parentId: true }
  });

  if (gameWithParent?.parentId && chatType !== ChatType.PRIVATE) {
    const parentGameAdmins = await prisma.gameParticipant.findMany({
      where: {
        gameId: gameWithParent.parentId,
        role: { in: ['OWNER', 'ADMIN'] }
      },
      include: {
        user: {
          select: {
            id: true,
            telegramId: true,
            language: true,
            currentCityId: true,
          }
        }
      }
    });

    for (const parentParticipant of parentGameAdmins) {
      const user = parentParticipant.user;
      if (user.id === sender.id) continue;
      const allowed = await NotificationPreferenceService.doesUserAllow(user.id, NotificationChannelType.TELEGRAM, PreferenceKey.SEND_MESSAGES);
      if (!allowed || !user.telegramId) continue;

      if (currentGameUserIds.has(user.id)) {
        continue;
      }

      if (hasMentions) {
        if (!mentionedUserIds?.has(user.id)) {
          continue;
        }
      } else {
        const isMuted = await ChatMuteService.isChatMuted(user.id, ChatContextType.GAME, game.id);
        if (isMuted) {
          continue;
        }
      }

      try {
        const lang = await getUserLanguageFromTelegramId(user.telegramId, undefined);
        const gameInfo = await formatGameInfoForUser(game, user.currentCityId, lang);
        const entityLabel = getEntityTypeLabel(game.entityType, lang);
        const showButtonText = getShowEntityButtonText(game.entityType, lang);

        const header = entityLabel
          ? `🏷️ ${escapeMarkdown(entityLabel)}\n📍 ${escapeMarkdown(gameInfo.place)} ${gameInfo.shortDayOfWeek} ${gameInfo.shortDate} ${gameInfo.startTime}, ${gameInfo.duration}`
          : `📍 ${escapeMarkdown(gameInfo.place)} ${gameInfo.shortDayOfWeek} ${gameInfo.shortDate} ${gameInfo.startTime}, ${gameInfo.duration}`;
        const formattedMessage = `${header}\n👤 *${escapeMarkdown(senderName)}*: ${escapeMarkdown(messageContent)}`;
        
        const chatTypeChar = { [ChatType.PUBLIC]: 'P', [ChatType.PRIVATE]: 'V', [ChatType.ADMINS]: 'A', [ChatType.PHOTOS]: 'F' }[chatType] ?? 'P';
        
        const buttons = [[
          {
            text: showButtonText,
            callback_data: `sg:${game.id}:${user.id}`
          },
          {
            text: t('telegram.reply', lang),
            callback_data: `rm:${message.id}:${game.id}:${chatTypeChar}`
          }
        ]];

        const { message: finalMessage, options } = buildMessageWithButtons(formattedMessage, buttons, lang);
        const trimmedMessage = trimTextForTelegram(finalMessage, false);
        
        await api.sendMessage(user.telegramId, trimmedMessage, options);
      } catch (error) {
        console.error(`Failed to send Telegram notification to parent game admin ${user.id}:`, error);
      }
    }
  }
}

