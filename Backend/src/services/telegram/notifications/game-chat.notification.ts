import { Api } from 'grammy';
import prisma from '../../../config/database';
import { ChatType, ChatContextType } from '@prisma/client';
import { t } from '../../../utils/translations';
import { escapeMarkdown, formatDuration } from '../utils';
import { formatDateInTimezone, getDateLabelInTimezone, getUserTimezoneFromCityId } from '../../user-timezone.service';
import { ChatMuteService } from '../../chat/chatMute.service';

export async function sendGameChatNotification(
  api: Api,
  message: any,
  game: any,
  sender: any
) {
  const place = game.court?.club?.name || game.club?.name || 'Unknown location';
  const senderName = `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || 'Unknown';
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
        const lang = user.language || 'en';
        const timezone = await getUserTimezoneFromCityId(user.currentCityId);
        const shortDate = await getDateLabelInTimezone(game.startTime, timezone, lang, false);
        const startTime = await formatDateInTimezone(game.startTime, 'HH:mm', timezone, lang);
        const duration = formatDuration(new Date(game.startTime), new Date(game.endTime), lang);
        
        const formattedMessage = `📍 ${escapeMarkdown(place)} ${shortDate} ${startTime}, ${duration}\n👤 *${escapeMarkdown(senderName)}*: ${escapeMarkdown(messageContent)}`;
        
        const showGameButton = t('telegram.showGame', lang);
        const replyButton = t('telegram.reply', lang);
        
        const chatTypeChar = chatType === 'PUBLIC' ? 'P' : chatType === 'PRIVATE' ? 'V' : 'A';
        const showGameData = `sg:${game.id}:${user.id}`;
        const replyData = `rm:${message.id}:${game.id}:${chatTypeChar}`;
        
        await api.sendMessage(user.telegramId, formattedMessage, { 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              {
                text: showGameButton,
                callback_data: showGameData
              },
              {
                text: replyButton,
                callback_data: replyData
              }
            ]]
          }
        });
      } catch (error) {
        console.error(`Failed to send Telegram notification to user ${user.id}:`, error);
      }
    }
  }
}

