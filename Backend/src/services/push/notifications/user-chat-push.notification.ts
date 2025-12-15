import { NotificationPayload, NotificationType } from '../../../types/notifications.types';

export async function createUserChatPushNotification(
  message: any,
  userChat: any,
  sender: any,
  _recipient: any
): Promise<NotificationPayload | null> {
  const senderName = `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || 'Unknown';
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
