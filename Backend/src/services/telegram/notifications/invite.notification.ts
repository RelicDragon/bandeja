import { Api } from 'grammy';
import prisma from '../../../config/database';
import { config } from '../../../config/env';
import { t } from '../../../utils/translations';
import { escapeMarkdown, getUserLanguageFromTelegramId } from '../utils';
import { buildMessageWithButtons } from '../shared/message-builder';
import { formatGameInfoForUser, formatUserName } from '../../shared/notification-base';

export async function sendInviteNotification(
  api: Api,
  invite: any
) {
  const receiver = await prisma.user.findUnique({
    where: { id: invite.receiverId },
    select: {
      id: true,
      telegramId: true,
      sendTelegramInvites: true,
      language: true,
      currentCityId: true,
    }
  });

  if (!receiver || !receiver.telegramId || !receiver.sendTelegramInvites) {
    return;
  }

  if (!invite.game) {
    return;
  }

  const lang = await getUserLanguageFromTelegramId(receiver.telegramId, undefined);
  const senderName = invite.sender ? formatUserName(invite.sender) : 'Unknown';
  const gameInfo = await formatGameInfoForUser(invite.game, receiver.currentCityId, lang);

  let message = `🎯 ${escapeMarkdown(t('telegram.inviteReceived', lang))}\n\n`;
  message += `👤 *${escapeMarkdown(senderName)}* ${escapeMarkdown(t('telegram.invitedYou', lang))}\n\n`;
  message += `📍 ${escapeMarkdown(gameInfo.place)} ${gameInfo.shortDayOfWeek} ${gameInfo.shortDate} ${gameInfo.startTime}, ${gameInfo.duration}`;

  if (invite.message) {
    message += `\n\n💬 ${escapeMarkdown(invite.message)}`;
  }

  const buttons = [
    [
      {
        text: t('telegram.acceptInvite', lang),
        callback_data: `ia:${invite.id}:accept`
      },
      {
        text: t('telegram.declineInvite', lang),
        callback_data: `ia:${invite.id}:decline`
      }
    ],
    [
      {
        text: t('telegram.viewGame', lang),
        url: `${config.frontendUrl}/games/${invite.game.id}`
      }
    ]
  ];

  const { message: finalMessage, options } = buildMessageWithButtons(message, buttons, lang);

  try {
    await api.sendMessage(receiver.telegramId, finalMessage, options);
  } catch (error) {
    console.error(`Failed to send Telegram invite notification to user ${receiver.id}:`, error);
  }
}

