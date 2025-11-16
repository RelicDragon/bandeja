import { Api } from 'grammy';
import prisma from '../../../config/database';
import { config } from '../../../config/env';
import { t } from '../../../utils/translations';
import { escapeMarkdown, escapeHTML, convertMarkdownMessageToHTML, formatDuration } from '../utils';
import { formatDateInTimezone, getDateLabelInTimezone, getUserTimezoneFromCityId } from '../../user-timezone.service';

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

  const senderName = invite.sender 
    ? `${invite.sender.firstName || ''} ${invite.sender.lastName || ''}`.trim() || 'Unknown'
    : 'Unknown';

  const lang = receiver.language || 'en';

  if (!invite.game) {
    return;
  }

  const game = invite.game;
  const place = game.court?.club?.name || game.club?.name || 'Unknown location';
  const timezone = await getUserTimezoneFromCityId(receiver.currentCityId);
  const shortDate = await getDateLabelInTimezone(game.startTime, timezone, lang, false);
  const startTime = await formatDateInTimezone(game.startTime, 'HH:mm', timezone, lang);
  const duration = formatDuration(new Date(game.startTime), new Date(game.endTime), lang);

  let message = `🎯 ${escapeMarkdown(t('telegram.inviteReceived', lang))}\n\n`;
  message += `👤 *${escapeMarkdown(senderName)}* ${escapeMarkdown(t('telegram.invitedYou', lang))}\n\n`;
  message += `📍 ${escapeMarkdown(place)} ${shortDate} ${startTime}, ${duration}`;

  if (invite.message) {
    message += `\n\n💬 ${escapeMarkdown(invite.message)}`;
  }

  const gameUrl = `${config.frontendUrl}/games/${game.id}`;
  const isLocalhost = gameUrl.includes('localhost') || gameUrl.includes('127.0.0.1');

  const replyMarkup: any = {
    inline_keyboard: [
      [
        {
          text: t('telegram.acceptInvite', lang),
          callback_data: `ia:${invite.id}:accept`
        },
        {
          text: t('telegram.declineInvite', lang),
          callback_data: `ia:${invite.id}:decline`
        }
      ]
    ]
  };

  let parseMode: 'Markdown' | 'HTML' = 'Markdown';

  if (!isLocalhost) {
    replyMarkup.inline_keyboard.push([
      {
        text: t('telegram.viewGame', lang),
        url: gameUrl
      }
    ]);
  } else {
    parseMode = 'HTML';
    message = convertMarkdownMessageToHTML(message);
    const viewGameText = escapeHTML(t('telegram.viewGame', lang));
    message += `\n\n🔗 <a href="${escapeHTML(gameUrl)}">${viewGameText}</a>`;
  }

  try {
    await api.sendMessage(receiver.telegramId, message, {
      parse_mode: parseMode,
      reply_markup: replyMarkup
    });
  } catch (error) {
    console.error(`Failed to send Telegram invite notification to user ${receiver.id}:`, error);
  }
}

