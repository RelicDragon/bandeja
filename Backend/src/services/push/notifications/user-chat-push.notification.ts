import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { formatChatNotificationMessageBody, formatUserName } from '../../shared/notification-base';
export async function createUserChatPushNotification(
  message: any,
  userChat: any,
  sender: any,
  recipient: any
): Promise<NotificationPayload | null> {
  const senderName = formatUserName(sender);
  const lang = (recipient?.language ?? 'en').split('-')[0].toLowerCase();
  const messageContent = formatChatNotificationMessageBody(message, lang) || '[Media]';

  return {
    type: NotificationType.USER_CHAT,
    title: senderName,
    body: messageContent,
    data: {
      userId: sender.id,
      userChatId: userChat.id,
      messageId: message.id
    },
    sound: 'default'
  };
}
