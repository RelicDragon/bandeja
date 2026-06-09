import { Api } from 'grammy';
import prisma from '../../../config/database';
import { config } from '../../../config/env';
import { t } from '../../../utils/translations';
import { escapeMarkdown, getUserLanguageFromTelegramId } from '../utils';
import { buildMessageWithButtons } from '../shared/message-builder';
import { formatGameInfoForUser, formatUserName } from '../../shared/notification-base';
import {
  appendTelegramGameScheduleExtras,
  formatInviteSenderNameWithLevel,
  withOptionalSportPrefix,
} from '../../shared/notificationSport';
import { NotificationPreferenceService } from '../../notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';
import { PreferenceKey } from '../../../types/notifications.types';
import { isBenignTelegramRecipientError } from '../telegramRecipientErrors';
import { guardedTelegramSendMessage } from '../guardedTelegramSend';

export async function sendInviteNotification(
  api: Api,
  invite: any
) {
  const allowed = await NotificationPreferenceService.doesUserAllow(invite.receiverId, NotificationChannelType.TELEGRAM, PreferenceKey.SEND_INVITES);
  if (!allowed) return;

  const receiver = await prisma.user.findUnique({
    where: { id: invite.receiverId },
    select: {
      id: true,
      telegramId: true,
      language: true,
      currentCityId: true,
      primarySport: true,
    }
  });

  if (!receiver?.telegramId) return;
  const telegramId = receiver.telegramId;

  if (!invite.game) {
    return;
  }

  const lang = await getUserLanguageFromTelegramId(receiver.telegramId, undefined);
  const senderName = invite.sender ? formatUserName(invite.sender) : 'Unknown';
  const senderDisplay = formatInviteSenderNameWithLevel(
    invite.sender,
    senderName,
    invite.game.sport,
    lang,
  );
  const gameInfo = await formatGameInfoForUser(invite.game, receiver.currentCityId, lang);

  const inviteTitle = withOptionalSportPrefix(
    t('telegram.inviteReceived', lang),
    invite.game.sport,
    receiver.primarySport,
    lang,
  );
  let message = `🎯 ${escapeMarkdown(inviteTitle)}\n\n`;
  message += `👤 *${escapeMarkdown(senderDisplay)}* ${escapeMarkdown(t('telegram.invitedYou', lang))}\n\n`;
  message += appendTelegramGameScheduleExtras(
    `📍 ${escapeMarkdown(gameInfo.place)} ${gameInfo.shortDayOfWeek} ${gameInfo.shortDate} ${gameInfo.startTime}, ${gameInfo.duration}`,
    invite.game,
    receiver.primarySport,
    lang,
    escapeMarkdown,
  );

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
    await guardedTelegramSendMessage(
      api,
      { userId: receiver.id, telegramId, kind: 'invite' },
      () => api.sendMessage(telegramId, finalMessage, options),
    );
  } catch (error) {
    if (isBenignTelegramRecipientError(error)) return;
    console.error(`Failed to send Telegram invite notification to user ${receiver.id}:`, error);
  }
}

