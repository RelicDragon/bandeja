import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { formatUserName } from '../../shared/notification-base';
import { getShortDayOfWeekForUser } from '../../user-timezone.service';

export async function createUserChatPushNotification(
  message: any,
  userChat: any,
  sender: any,
  recipient: any
): Promise<NotificationPayload | null> {
  const senderName = formatUserName(sender);
  const messageContent = message.content || '[Media]';
  const shortDayOfWeek = await getShortDayOfWeekForUser(new Date(), recipient?.currentCityId ?? null, recipient?.language ?? 'en');

  return {
    type: NotificationType.USER_CHAT,
    title: senderName,
    body: messageContent,
    data: {
      userId: sender.id,
      userChatId: userChat.id,
      messageId: message.id,
      shortDayOfWeek
    },
    sound: 'default'
  };
}
