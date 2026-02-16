import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { formatUserName } from '../../shared/notification-base';
export async function createUserChatPushNotification(
  message: any,
  userChat: any,
  sender: any,
  _recipient: any
): Promise<NotificationPayload | null> {
  const senderName = formatUserName(sender);
  const messageContent = message.content || '[Media]';

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
