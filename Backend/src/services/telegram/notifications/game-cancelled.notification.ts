import { Api } from 'grammy';
import prisma from '../../../config/database';
import { NotificationPreferenceService } from '../../notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';
import { PreferenceKey } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import { escapeMarkdown, getUserLanguageFromTelegramId } from '../utils';
import { buildMessageWithButtons } from '../shared/message-builder';
import { isBenignTelegramRecipientError } from '../telegramRecipientErrors';
import { config } from '../../../config/env';

export interface GameCancelledMeta {
  gameId: string;
  entityType: string;
  name?: string;
  cancelledAt: string;
}

export async function sendGameCancelledNotification(
  api: Api,
  meta: GameCancelledMeta,
  recipientUserIds: string[]
) {
  if (recipientUserIds.length === 0) return;

  const users = await prisma.user.findMany({
    where: { id: { in: recipientUserIds }, telegramId: { not: null } },
    select: { id: true, telegramId: true, language: true },
  });

  for (const user of users) {
    if (!user.telegramId) continue;
    const allowed = await NotificationPreferenceService.doesUserAllow(
      user.id,
      NotificationChannelType.TELEGRAM,
      PreferenceKey.SEND_REMINDERS
    );
    if (!allowed) continue;

    try {
      const lang = await getUserLanguageFromTelegramId(user.telegramId, undefined);
      const title = t('telegram.gameCancelled', lang) !== 'telegram.gameCancelled'
        ? t('telegram.gameCancelled', lang)
        : 'Cancelled';
      const body = meta.name
        ? t('push.gameCancelledBodyWithName', lang).replace('{{name}}', meta.name)
        : t('push.gameCancelledBody', lang);

      const message = `❌ ${escapeMarkdown(title)}\n\n${escapeMarkdown(body || 'Cancelled by the organizer')}`;
      const buttons = [[
        { text: t('telegram.viewGame', lang), url: `${config.frontendUrl}/games/${meta.gameId}` },
      ]];
      const { message: finalMessage, options } = buildMessageWithButtons(message, buttons, lang);
      await api.sendMessage(user.telegramId, finalMessage, options);
    } catch (error) {
      if (isBenignTelegramRecipientError(error)) continue;
      console.error(`Failed to send Telegram game cancelled to user ${user.id}:`, error);
    }
  }
}
