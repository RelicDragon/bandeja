import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { formatUserName } from '../../shared/notification-base';
import { getShortDayOfWeekForUser } from '../../user-timezone.service';

export async function createGroupChatPushNotification(
  message: any,
  groupChannel: any,
  sender: any,
  recipient: any
): Promise<NotificationPayload | null> {
  if (!message || !groupChannel || !sender) {
    return null;
  }

  const senderName = formatUserName(sender);
  const messageContent = message.content || '[Media]';
  const groupName = groupChannel.name;
  const isChannel = groupChannel.isChannel;
  const shortDayOfWeek = await getShortDayOfWeekForUser(new Date(), recipient?.currentCityId ?? null, recipient?.language ?? 'en');

  const title = isChannel ? `📢 ${groupName}` : `👥 ${groupName}`;
  const body = `${senderName}: ${messageContent}`;

  return {
    type: NotificationType.GROUP_CHAT,
    title,
    body,
    data: {
      groupChannelId: groupChannel.id,
      messageId: message.id,
      shortDayOfWeek
    },
    sound: 'default'
  };
}
