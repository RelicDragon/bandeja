import { Api } from 'grammy';
import prisma from '../../../config/database';
import { ChatContextType } from '@prisma/client';
import { escapeMarkdown } from '../utils';
import { formatUserName } from '../../shared/notification-base';
import { ChatMuteService } from '../../chat/chatMute.service';

export async function sendBugChatNotification(
  api: Api,
  message: any,
  bug: any,
  sender: any
) {
  const bugText = (bug.text || 'Bug').substring(0, 50);
  const senderName = formatUserName(sender);
  const messageContent = message.content || '[Media]';

  const formattedMessage = `🐛 ${escapeMarkdown(bugText)}\n👤 *${escapeMarkdown(senderName)}*: ${escapeMarkdown(messageContent)}`;

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
        sendTelegramMessages: true,
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
            sendTelegramMessages: true,
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
        sendTelegramMessages: true,
      },
      select: {
        id: true,
        telegramId: true,
        sendTelegramMessages: true,
      }
    });

    for (const admin of admins) {
      allUsers.add(admin.id);
    }

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

      if (user && user.telegramId && user.sendTelegramMessages) {
        notifiedUserIds.add(userId);
        try {
          await api.sendMessage(user.telegramId, formattedMessage, { parse_mode: 'Markdown' });
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
        sendTelegramMessages: true,
      }
    });

    if (bugCreator && bugCreator.id !== sender.id) {
      const isMuted = await ChatMuteService.isChatMuted(bugCreator.id, ChatContextType.BUG, bug.id);
      if (!isMuted && bugCreator.telegramId && bugCreator.sendTelegramMessages) {
        try {
          await api.sendMessage(bugCreator.telegramId, formattedMessage, { parse_mode: 'Markdown' });
        } catch (error) {
          console.error(`Failed to send Telegram notification to bug creator ${bugCreator.id}:`, error);
        }
      }
      notifiedUserIds.add(bugCreator.id);
    }

    const bugParticipants = await prisma.bugParticipant.findMany({
      where: { bugId: bug.id },
      include: {
        user: {
          select: {
            id: true,
            telegramId: true,
            sendTelegramMessages: true,
          }
        }
      }
    });

    for (const participant of bugParticipants) {
      const user = participant.user;
      
      if (!user.telegramId || !user.sendTelegramMessages || user.id === sender.id || notifiedUserIds.has(user.id)) {
        continue;
      }

      const isMuted = await ChatMuteService.isChatMuted(user.id, ChatContextType.BUG, bug.id);
      if (isMuted) {
        notifiedUserIds.add(user.id);
        continue;
      }

      notifiedUserIds.add(user.id);
      try {
        await api.sendMessage(user.telegramId, formattedMessage, { parse_mode: 'Markdown' });
      } catch (error) {
        console.error(`Failed to send Telegram notification to bug participant ${user.id}:`, error);
      }
    }

    const admins = await prisma.user.findMany({
      where: {
        isAdmin: true,
        NOT: { id: sender.id },
        telegramId: { not: null },
        sendTelegramMessages: true,
      },
      select: {
        id: true,
        telegramId: true,
      }
    });

    for (const admin of admins) {
      if (admin.telegramId && !notifiedUserIds.has(admin.id)) {
        const isMuted = await ChatMuteService.isChatMuted(admin.id, ChatContextType.BUG, bug.id);
        if (isMuted) {
          notifiedUserIds.add(admin.id);
          continue;
        }
        
        notifiedUserIds.add(admin.id);
        try {
          await api.sendMessage(admin.telegramId, formattedMessage, { parse_mode: 'Markdown' });
        } catch (error) {
          console.error(`Failed to send Telegram notification to admin ${admin.id}:`, error);
        }
      }
    }
  }
}

