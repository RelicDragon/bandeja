import { Api } from 'grammy';
import prisma from '../../../config/database';
import { escapeMarkdown } from '../utils';

export async function sendBugChatNotification(
  api: Api,
  message: any,
  bug: any,
  sender: any
) {
  const bugText = (bug.text || 'Bug').substring(0, 50);
  const senderName = `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || 'Unknown';
  const messageContent = message.content || '[Media]';

  const formattedMessage = `🐛 ${escapeMarkdown(bugText)}\n👤 *${escapeMarkdown(senderName)}*: ${escapeMarkdown(messageContent)}`;

  const notifiedUserIds = new Set<string>();
  notifiedUserIds.add(sender.id);

  const bugCreator = await prisma.user.findUnique({
    where: { id: bug.senderId },
    select: {
      id: true,
      telegramId: true,
      sendTelegramMessages: true,
    }
  });

  if (bugCreator && bugCreator.id !== sender.id) {
    if (bugCreator.telegramId && bugCreator.sendTelegramMessages) {
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
      notifiedUserIds.add(admin.id);
      try {
        await api.sendMessage(admin.telegramId, formattedMessage, { parse_mode: 'Markdown' });
      } catch (error) {
        console.error(`Failed to send Telegram notification to admin ${admin.id}:`, error);
      }
    }
  }
}

