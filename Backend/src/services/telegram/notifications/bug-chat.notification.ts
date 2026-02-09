import { Api } from 'grammy';
import prisma from '../../../config/database';
import { config } from '../../../config/env';
import { ChatContextType } from '@prisma/client';
import { NotificationPreferenceService } from '../../notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';
import { PreferenceKey } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import { escapeMarkdown, getUserLanguageFromTelegramId } from '../utils';
import { formatUserName } from '../../shared/notification-base';
import { getShortDayOfWeek, getTimezonesByCityIds } from '../../user-timezone.service';
import { DEFAULT_TIMEZONE } from '../../../utils/constants';
import { ChatMuteService } from '../../chat/chatMute.service';
import { buildMessageWithButtons } from '../shared/message-builder';

export async function sendBugChatNotification(
  api: Api,
  message: any,
  bug: any,
  sender: any
) {
  const bugText = (bug.text || 'Bug').substring(0, 50);
  const senderName = formatUserName(sender);
  const messageContent = message.content || '[Media]';

  const getBugMessage = (lang: string) =>
    `🐛 ${escapeMarkdown(t('notifications.bugReport', lang))}: ${escapeMarkdown(bugText)}\n👤 *${escapeMarkdown(senderName)}*: ${escapeMarkdown(messageContent)}`;

  const bugChatUrl = bug.groupChannel
    ? `${config.frontendUrl}/channel-chat/${bug.groupChannel.id}`
    : `${config.frontendUrl}/bugs`;

  const buildBugButtons = (lang: string) => [[
    { text: t('telegram.viewChat', lang), url: bugChatUrl },
    { text: t('telegram.reply', lang), callback_data: `rbm:${message.id}:${bug.id}` }
  ]];

  const mentionIds = message.mentionIds || [];
  const hasMentions = mentionIds.length > 0;

  const notifiedUserIds = new Set<string>();
  notifiedUserIds.add(sender.id);

  if (hasMentions) {
    const allUsers = new Set<string>();
    
    const bugCreator = await prisma.user.findUnique({
      where: { id: bug.senderId },
      select: {
        id: true,
        telegramId: true,
        currentCityId: true,
      }
    });

    if (bugCreator) {
      allUsers.add(bugCreator.id);
    }

    const bugParticipants = await prisma.bugParticipant.findMany({
      where: { bugId: bug.id },
      include: {
        user: {
          select: {
            id: true,
            telegramId: true,
            currentCityId: true,
          }
        }
      }
    });

    for (const participant of bugParticipants) {
      allUsers.add(participant.user.id);
    }

    const admins = await prisma.user.findMany({
      where: {
        isAdmin: true,
        telegramId: { not: null },
      },
      select: {
        id: true,
        telegramId: true,
        currentCityId: true,
      }
    });

    for (const admin of admins) {
      allUsers.add(admin.id);
    }

    const mentionCityIds = [
      bugCreator?.currentCityId ?? null,
      ...bugParticipants.map(p => p.user.currentCityId ?? null),
      ...admins.map(a => a.currentCityId ?? null),
    ];
    const timezoneMap = await getTimezonesByCityIds(mentionCityIds);

    for (const userId of mentionIds) {
      if (userId === sender.id || notifiedUserIds.has(userId)) {
        continue;
      }

      let user: any = null;
      if (bugCreator && bugCreator.id === userId) {
        user = bugCreator;
      } else {
        const participant = bugParticipants.find(p => p.user.id === userId);
        if (participant) {
          user = participant.user;
        } else {
          const admin = admins.find(a => a.id === userId);
          if (admin) {
            user = admin;
          }
        }
      }

      const allowed = user ? await NotificationPreferenceService.doesUserAllow(user.id, NotificationChannelType.TELEGRAM, PreferenceKey.SEND_MESSAGES) : false;
      if (user && user.telegramId && allowed) {
        notifiedUserIds.add(userId);
        try {
          const lang = await getUserLanguageFromTelegramId(user.telegramId, undefined);
          const timezone = timezoneMap.get(user.currentCityId ?? null) ?? DEFAULT_TIMEZONE;
          const shortDayOfWeek = await getShortDayOfWeek(new Date(), timezone, lang);
          const buttons = buildBugButtons(lang);
          const { message: finalMessage, options } = buildMessageWithButtons(`${shortDayOfWeek} ${getBugMessage(lang)}`, buttons, lang);
          await api.sendMessage(user.telegramId, finalMessage, options);
        } catch (error) {
          console.error(`Failed to send Telegram notification to mentioned user ${userId}:`, error);
        }
      }
    }
  } else {
    const bugCreator = await prisma.user.findUnique({
      where: { id: bug.senderId },
      select: {
        id: true,
        telegramId: true,
        currentCityId: true,
      }
    });

    const bugParticipants = await prisma.bugParticipant.findMany({
      where: { bugId: bug.id },
      include: {
        user: {
          select: {
            id: true,
            telegramId: true,
            currentCityId: true,
          }
        }
      }
    });

    const admins = await prisma.user.findMany({
      where: {
        isAdmin: true,
        NOT: { id: sender.id },
        telegramId: { not: null },
      },
      select: {
        id: true,
        telegramId: true,
        currentCityId: true,
      }
    });

    const elseCityIds = [
      bugCreator?.currentCityId ?? null,
      ...bugParticipants.map(p => p.user.currentCityId ?? null),
      ...admins.map(a => a.currentCityId ?? null),
    ];
    const elseTimezoneMap = await getTimezonesByCityIds(elseCityIds);

    if (bugCreator && bugCreator.id !== sender.id) {
      const isMuted = await ChatMuteService.isChatMuted(bugCreator.id, ChatContextType.BUG, bug.id);
      const creatorAllowed = await NotificationPreferenceService.doesUserAllow(bugCreator.id, NotificationChannelType.TELEGRAM, PreferenceKey.SEND_MESSAGES);
      if (!isMuted && bugCreator.telegramId && creatorAllowed) {
        try {
          const lang = await getUserLanguageFromTelegramId(bugCreator.telegramId, undefined);
          const timezone = elseTimezoneMap.get(bugCreator.currentCityId ?? null) ?? DEFAULT_TIMEZONE;
          const shortDayOfWeek = await getShortDayOfWeek(new Date(), timezone, lang);
          const buttons = buildBugButtons(lang);
          const { message: finalMessage, options } = buildMessageWithButtons(`${shortDayOfWeek} ${getBugMessage(lang)}`, buttons, lang);
          await api.sendMessage(bugCreator.telegramId, finalMessage, options);
        } catch (error) {
          console.error(`Failed to send Telegram notification to bug creator ${bugCreator.id}:`, error);
        }
      }
      notifiedUserIds.add(bugCreator.id);
    }

    for (const participant of bugParticipants) {
      const user = participant.user;
      if (user.id === sender.id || notifiedUserIds.has(user.id)) continue;
      const allowed = await NotificationPreferenceService.doesUserAllow(user.id, NotificationChannelType.TELEGRAM, PreferenceKey.SEND_MESSAGES);
      if (!user.telegramId || !allowed) continue;

      const isMuted = await ChatMuteService.isChatMuted(user.id, ChatContextType.BUG, bug.id);
      if (isMuted) {
        notifiedUserIds.add(user.id);
        continue;
      }

      notifiedUserIds.add(user.id);
      try {
        const lang = await getUserLanguageFromTelegramId(user.telegramId, undefined);
        const timezone = elseTimezoneMap.get(user.currentCityId ?? null) ?? DEFAULT_TIMEZONE;
        const shortDayOfWeek = await getShortDayOfWeek(new Date(), timezone, lang);
        const buttons = buildBugButtons(lang);
        const { message: finalMessage, options } = buildMessageWithButtons(`${shortDayOfWeek} ${getBugMessage(lang)}`, buttons, lang);
        await api.sendMessage(user.telegramId, finalMessage, options);
      } catch (error) {
        console.error(`Failed to send Telegram notification to bug participant ${user.id}:`, error);
      }
    }

    for (const admin of admins) {
      if (!admin.telegramId || notifiedUserIds.has(admin.id)) continue;
      const adminAllowed = await NotificationPreferenceService.doesUserAllow(admin.id, NotificationChannelType.TELEGRAM, PreferenceKey.SEND_MESSAGES);
      if (!adminAllowed) continue;
      const isMuted = await ChatMuteService.isChatMuted(admin.id, ChatContextType.BUG, bug.id);
      if (isMuted) {
        notifiedUserIds.add(admin.id);
        continue;
      }
      notifiedUserIds.add(admin.id);
      try {
        const lang = await getUserLanguageFromTelegramId(admin.telegramId, undefined);
        const timezone = elseTimezoneMap.get(admin.currentCityId ?? null) ?? DEFAULT_TIMEZONE;
        const shortDayOfWeek = await getShortDayOfWeek(new Date(), timezone, lang);
        const buttons = buildBugButtons(lang);
        const { message: finalMessage, options } = buildMessageWithButtons(`${shortDayOfWeek} ${getBugMessage(lang)}`, buttons, lang);
        await api.sendMessage(admin.telegramId, finalMessage, options);
      } catch (error) {
        console.error(`Failed to send Telegram notification to admin ${admin.id}:`, error);
      }
    }
  }
}

