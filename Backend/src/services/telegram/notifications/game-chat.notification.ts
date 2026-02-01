import { Api } from 'grammy';
import prisma from '../../../config/database';
import { ChatType, ChatContextType } from '@prisma/client';
import { t } from '../../../utils/translations';
import { escapeMarkdown, getUserLanguageFromTelegramId, trimTextForTelegram } from '../utils';
import { buildMessageWithButtons } from '../shared/message-builder';
import { formatGameInfoForUser, formatUserName } from '../../shared/notification-base';
import { ChatMuteService } from '../../chat/chatMute.service';

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
          sendTelegramMessages: true,
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
    
    if (!user.telegramId || !user.sendTelegramMessages || user.id === sender.id) {
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

    let canSeeMessage = false;
    
    if (chatType === ChatType.PUBLIC) {
      canSeeMessage = true;
    } else if (chatType === ChatType.PRIVATE) {
      canSeeMessage = participant.isPlaying;
    } else if (chatType === ChatType.ADMINS) {
      canSeeMessage = participant.role === 'OWNER' || participant.role === 'ADMIN';
    }

    if (canSeeMessage) {
      try {
        const lang = await getUserLanguageFromTelegramId(user.telegramId, undefined);
        const gameInfo = await formatGameInfoForUser(game, user.currentCityId, lang);
        
        const formattedMessage = `📍 ${escapeMarkdown(gameInfo.place)} ${gameInfo.shortDayOfWeek} ${gameInfo.shortDate} ${gameInfo.startTime}, ${gameInfo.duration}\n👤 *${escapeMarkdown(senderName)}*: ${escapeMarkdown(messageContent)}`;
        
        const chatTypeChar = chatType === 'PUBLIC' ? 'P' : chatType === 'PRIVATE' ? 'V' : 'A';
        
        const buttons = [[
          {
            text: t('telegram.showGame', lang),
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

  if (gameWithParent?.parentId) {
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
            sendTelegramMessages: true,
            language: true,
            currentCityId: true,
          }
        }
      }
    });

    for (const parentParticipant of parentGameAdmins) {
      const user = parentParticipant.user;
      
      if (!user.telegramId || !user.sendTelegramMessages || user.id === sender.id) {
        continue;
      }

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
        
        const formattedMessage = `📍 ${escapeMarkdown(gameInfo.place)} ${gameInfo.shortDayOfWeek} ${gameInfo.shortDate} ${gameInfo.startTime}, ${gameInfo.duration}\n👤 *${escapeMarkdown(senderName)}*: ${escapeMarkdown(messageContent)}`;
        
        const chatTypeChar = chatType === 'PUBLIC' ? 'P' : chatType === 'PRIVATE' ? 'V' : 'A';
        
        const buttons = [[
          {
            text: t('telegram.showGame', lang),
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

