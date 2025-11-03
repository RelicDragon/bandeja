import { Api } from 'grammy';
import prisma from '../../../config/database';
import { escapeMarkdown } from '../utils';

export async function sendBugChatNotification(
  api: Api,
  message: any,
  bug: any,
  sender: any
) {
  const bugText = bug.text || 'Bug';
  const senderName = `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || 'Unknown';
  const messageContent = message.content || '[Media]';

  const formattedMessage = `🐛 ${escapeMarkdown(bugText)}\n👤 *${escapeMarkdown(senderName)}*: ${escapeMarkdown(messageContent)}`;

  const bugCreator = await prisma.user.findUnique({
    where: { id: bug.senderId },
    select: {
      id: true,
      telegramId: true,
      sendTelegramMessages: true,
    }
  });

  if (bugCreator && bugCreator.telegramId && bugCreator.sendTelegramMessages && bugCreator.id !== sender.id) {
    try {
      await api.sendMessage(bugCreator.telegramId, formattedMessage, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error(`Failed to send Telegram notification to bug creator ${bugCreator.id}:`, error);
    }
  }

  const admins = await prisma.user.findMany({
    where: {
      OR: [
        { isAdmin: true },
        { isTrainer: true }
      ],
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
    if (admin.telegramId && admin.id !== bugCreator?.id) {
      try {
        await api.sendMessage(admin.telegramId, formattedMessage, { parse_mode: 'Markdown' });
      } catch (error) {
        console.error(`Failed to send Telegram notification to admin ${admin.id}:`, error);
      }
    }
  }
}

