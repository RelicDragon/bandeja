import { Api } from 'grammy';
import { ChatContextType } from '@prisma/client';
import { t } from '../../../utils/translations';
import { escapeMarkdown, getUserLanguageFromTelegramId } from '../utils';
import { buildMessageWithButtons } from '../shared/message-builder';
import { formatUserName } from '../../shared/notification-base';
import { getShortDayOfWeek, getTimezonesByCityIds } from '../../user-timezone.service';
import { DEFAULT_TIMEZONE } from '../../../utils/constants';
import { ChatMuteService } from '../../chat/chatMute.service';
import prisma from '../../../config/database';

export async function sendGroupChatNotification(
  api: Api,
  message: any,
  groupChannel: any,
  sender: any
) {
  const senderName = formatUserName(sender);
  const messageContent = message.content || '[Media]';
  const mentionIds = message.mentionIds || [];
  const hasMentions = mentionIds.length > 0;
  const mentionedUserIds = hasMentions ? new Set(mentionIds) : null;

  const participants = await prisma.groupChannelParticipant.findMany({
    where: { groupChannelId: groupChannel.id },
    include: {
      user: {
        select: {
          id: true,
          telegramId: true,
          sendTelegramMessages: true,
          language: true,
          firstName: true,
          lastName: true,
          currentCityId: true,
        }
      }
    }
  });

  const cityIds = participants.map(p => p.user.currentCityId ?? null);
  const timezoneMap = await getTimezonesByCityIds(cityIds);

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
      const isMuted = await ChatMuteService.isChatMuted(user.id, ChatContextType.GROUP, groupChannel.id);
      if (isMuted) {
        continue;
      }
    }

    try {
      const lang = await getUserLanguageFromTelegramId(user.telegramId, undefined);
      const timezone = timezoneMap.get(user.currentCityId ?? null) ?? DEFAULT_TIMEZONE;
      const shortDayOfWeek = await getShortDayOfWeek(new Date(), timezone, lang);
      const groupIcon = groupChannel.isChannel ? '📢' : '👥';
      const formattedMessage = `${shortDayOfWeek} ${groupIcon} *${escapeMarkdown(groupChannel.name)}*\n👤 *${escapeMarkdown(senderName)}*: ${escapeMarkdown(messageContent)}`;
      
      const buttons = [[
        {
          text: t('telegram.reply', lang),
          callback_data: `rg:${message.id}:${groupChannel.id}`
        }
      ]];

      const { message: finalMessage, options } = buildMessageWithButtons(formattedMessage, buttons, lang);
      
      await api.sendMessage(user.telegramId, finalMessage, options);
    } catch (error) {
      console.error(`Failed to send Telegram notification to user ${user.id}:`, error);
    }
  }
}
