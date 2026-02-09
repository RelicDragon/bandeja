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
import { NotificationPreferenceService } from '../../notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';
import { PreferenceKey } from '../../../types/notifications.types';
import { config } from '../../../config/env';

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
    if (user.id === sender.id) continue;
    const allowed = await NotificationPreferenceService.doesUserAllow(user.id, NotificationChannelType.TELEGRAM, PreferenceKey.SEND_MESSAGES);
    if (!allowed || !user.telegramId) continue;

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

    const canWrite = groupChannel.isChannel
      ? (participant.role === 'OWNER' || participant.role === 'ADMIN')
      : true;

    const chatPath = (groupChannel.bug || groupChannel.marketItem)
      ? `/channel-chat/${groupChannel.id}`
      : `/group-chat/${groupChannel.id}`;
    const chatUrl = `${config.frontendUrl}${chatPath}`;

    try {
      const lang = await getUserLanguageFromTelegramId(user.telegramId, undefined);
      const timezone = timezoneMap.get(user.currentCityId ?? null) ?? DEFAULT_TIMEZONE;
      const shortDayOfWeek = await getShortDayOfWeek(new Date(), timezone, lang);
      const contextLabel = groupChannel.bug?.id
        ? `🐛 ${t('notifications.bugReport', lang)}`
        : groupChannel.marketItem?.id
          ? `🛒 ${t('notifications.marketplaceListing', lang)}`
          : groupChannel.isChannel
            ? `📢 ${t('notifications.channel', lang)}`
            : `👥 ${t('notifications.group', lang)}`;
      const formattedMessage = `${shortDayOfWeek} ${contextLabel}: *${escapeMarkdown(groupChannel.name)}*\n👤 *${escapeMarkdown(senderName)}*: ${escapeMarkdown(messageContent)}`;
      
      const viewButtonKey = groupChannel.bug?.id
        ? 'telegram.viewBug'
        : groupChannel.marketItem?.id
          ? 'telegram.viewMarketplace'
          : groupChannel.isChannel
            ? 'telegram.viewChannel'
            : 'telegram.viewGroup';
      const buttons: Array<{ text: string; callback_data?: string; url?: string }> = [
        { text: t(viewButtonKey, lang), url: chatUrl }
      ];
      if (canWrite) {
        buttons.push({ text: t('telegram.reply', lang), callback_data: `rg:${message.id}:${groupChannel.id}` });
      }

      const { message: finalMessage, options } = buildMessageWithButtons(formattedMessage, [buttons], lang);
      
      await api.sendMessage(user.telegramId, finalMessage, options);
    } catch (error) {
      console.error(`Failed to send Telegram notification to user ${user.id}:`, error);
    }
  }
}
