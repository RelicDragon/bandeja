import prisma from '../../../config/database';
import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import { TransactionType } from '@prisma/client';
import { getShortDayOfWeekForUser } from '../../user-timezone.service';

export async function createTransactionPushNotification(
  transactionId: string,
  userId: string,
  isSender: boolean
): Promise<NotificationPayload | null> {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      transactionRows: true,
      fromUser: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          language: true,
          currentCityId: true,
        },
      },
      toUser: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          language: true,
          currentCityId: true,
        },
      },
    },
  });

  if (!transaction) {
    return null;
  }

  const user = isSender ? transaction.fromUser : transaction.toUser;
  if (!user) {
    return null;
  }

  const lang = user.language || 'en';
  const otherUser = isSender ? transaction.toUser : transaction.fromUser;
  const amount = Math.abs(transaction.total);
  
  let title = '';
  let body = '';

  switch (transaction.type) {
    case TransactionType.NEW_COIN:
      title = t('telegram.transactionNewCoin', lang) || 'Coins Added';
      body = `💰 ${t('telegram.transactionAmount', lang) || 'Amount'}: ${amount}`;
      break;

    case TransactionType.REFUND:
      title = t('telegram.transactionRefund', lang) || 'Refund Received';
      body = `💰 ${t('telegram.transactionAmount', lang) || 'Amount'}: ${amount}`;
      break;

    case TransactionType.PURCHASE:
      title = t('telegram.transactionPurchase', lang) || 'Purchase Made';
      body = `💰 ${t('telegram.transactionAmount', lang) || 'Amount'}: ${amount}`;
      break;

    case TransactionType.TRANSFER:
      if (isSender) {
        title = t('telegram.transactionSent', lang) || 'Transaction Sent';
        const toName = otherUser ? `${otherUser.firstName} ${otherUser.lastName}`.trim() : t('telegram.unknown', lang) || 'Unknown';
        body = `💰 ${t('telegram.transactionAmount', lang) || 'Amount'}: ${amount}\n${t('telegram.transactionTo', lang) || 'To'}: ${toName}`;
      } else {
        title = t('telegram.transactionReceived', lang) || 'Transaction Received';
        const fromName = otherUser ? `${otherUser.firstName} ${otherUser.lastName}`.trim() : t('telegram.unknown', lang) || 'Unknown';
        body = `💰 ${t('telegram.transactionAmount', lang) || 'Amount'}: ${amount}\n${t('telegram.transactionFrom', lang) || 'From'}: ${fromName}`;
      }
      break;

    default:
      return null;
  }

  if (transaction.transactionRows.length > 0) {
    const description = transaction.transactionRows[0].name;
    body += `\n${t('telegram.transactionDescription', lang) || 'Description'}: ${description}`;
  }

  const shortDayOfWeek = await getShortDayOfWeekForUser(new Date(), user.currentCityId, lang);

  return {
    type: NotificationType.TRANSACTION,
    title,
    body,
    data: {
      transactionId: transaction.id,
      shortDayOfWeek
    },
    sound: 'default'
  };
}
