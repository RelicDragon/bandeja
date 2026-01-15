import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { formatUserName } from '../../shared/notification-base';

export async function createGroupChatPushNotification(
  message: any,
  groupChannel: any,
  sender: any,
  _recipient: any
): Promise<NotificationPayload | null> {
  if (!message || !groupChannel || !sender) {
    return null;
  }

  const senderName = formatUserName(sender);
  const messageContent = message.content || '[Media]';
  const groupName = groupChannel.name;
  const isChannel = groupChannel.isChannel;

  const title = isChannel ? `📢 ${groupName}` : `👥 ${groupName}`;
  const body = `${senderName}: ${messageContent}`;

  return {
    type: NotificationType.GROUP_CHAT,
    title,
    body,
    data: {
      groupChannelId: groupChannel.id,
      messageId: message.id
    },
    sound: 'default'
  };
}
