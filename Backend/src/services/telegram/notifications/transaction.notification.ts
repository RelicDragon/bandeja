import { Api } from 'grammy';
import { config } from '../../../config/env';
import { NotificationPreferenceService } from '../../notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';
import { PreferenceKey } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import { escapeMarkdown, getUserLanguageFromTelegramId } from '../utils';
import { buildMessageWithButtons } from '../shared/message-builder';
import prisma from '../../../config/database';
import { isBenignTelegramRecipientError } from '../telegramRecipientErrors';
import { TransactionType } from '@prisma/client';

export async function sendTransactionNotification(
  api: Api,
  transactionId: string,
  userId: string,
  isSender: boolean
) {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      transactionRows: true,
      fromUser: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          telegramId: true,
          currentCityId: true,
        },
      },
      toUser: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          telegramId: true,
          currentCityId: true,
        },
      },
    },
  });

  if (!transaction) {
    return;
  }

  const user = isSender ? transaction.fromUser : transaction.toUser;
  if (!user) return;
  const allowed = await NotificationPreferenceService.doesUserAllow(user.id, NotificationChannelType.TELEGRAM, PreferenceKey.SEND_WALLET_NOTIFICATIONS);
  if (!allowed || !user.telegramId) return;

  try {
    const lang = await getUserLanguageFromTelegramId(user.telegramId, undefined);
    const otherUser = isSender ? transaction.toUser : transaction.fromUser;
    const amount = Math.abs(transaction.total);

    let title = '';
    let emoji = '';
    let message = '';

    switch (transaction.type) {
      case TransactionType.NEW_COIN:
        title = t('telegram.transactionNewCoin', lang) || 'Coins Added';
        emoji = '🎁';
        message = `${emoji} *${escapeMarkdown(title)}*\n\n`;
        message += `💰 ${escapeMarkdown(t('telegram.transactionAmount', lang) || 'Amount')}: ${amount}\n`;
        break;

      case TransactionType.REFUND:
        title = t('telegram.transactionRefund', lang) || 'Refund Received';
        emoji = '↩️';
        message = `${emoji} *${escapeMarkdown(title)}*\n\n`;
        message += `💰 ${escapeMarkdown(t('telegram.transactionAmount', lang) || 'Amount')}: ${amount}\n`;
        break;

      case TransactionType.PURCHASE:
        title = t('telegram.transactionPurchase', lang) || 'Purchase Made';
        emoji = '🛒';
        message = `${emoji} *${escapeMarkdown(title)}*\n\n`;
        message += `💰 ${escapeMarkdown(t('telegram.transactionAmount', lang) || 'Amount')}: ${amount}\n`;
        break;

      case TransactionType.TRANSFER:
        if (isSender) {
          title = t('telegram.transactionSent', lang) || 'Transaction Sent';
          emoji = '📤';
          message = `${emoji} *${escapeMarkdown(title)}*\n\n`;
          message += `💰 ${escapeMarkdown(t('telegram.transactionAmount', lang) || 'Amount')}: ${amount}\n`;
          if (otherUser) {
            const toName = `${otherUser.firstName} ${otherUser.lastName}`.trim();
            message += `👤 ${escapeMarkdown(t('telegram.transactionTo', lang) || 'To')}: ${escapeMarkdown(toName)}\n`;
          }
        } else {
          title = t('telegram.transactionReceived', lang) || 'Transaction Received';
          emoji = '📥';
          message = `${emoji} *${escapeMarkdown(title)}*\n\n`;
          message += `💰 ${escapeMarkdown(t('telegram.transactionAmount', lang) || 'Amount')}: ${amount}\n`;
          if (otherUser) {
            const fromName = `${otherUser.firstName} ${otherUser.lastName}`.trim();
            message += `👤 ${escapeMarkdown(t('telegram.transactionFrom', lang) || 'From')}: ${escapeMarkdown(fromName)}\n`;
          }
        }
        break;

      default:
        return;
    }

    if (transaction.transactionRows.length > 0) {
      const description = transaction.transactionRows[0].name;
      message += `\n📝 ${escapeMarkdown(t('telegram.transactionDescription', lang) || 'Description')}: ${escapeMarkdown(description)}`;
    }

    const buttons = [[
      {
        text: t('telegram.viewWallet', lang) || 'View Wallet',
        url: `${config.frontendUrl}/profile`
      }
    ]];

    const { message: finalMessage, options } = buildMessageWithButtons(message, buttons, lang);
    await api.sendMessage(user.telegramId, finalMessage, options);
  } catch (error) {
    if (isBenignTelegramRecipientError(error)) return;
    console.error(`Failed to send Telegram transaction notification to user ${userId}:`, error);
  }
}
