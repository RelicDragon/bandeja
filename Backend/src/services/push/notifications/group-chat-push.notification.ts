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

  const data: Record<string, string> = {
    groupChannelId: groupChannel.id,
    messageId: message.id,
    shortDayOfWeek
  };
  if (groupChannel.bug?.id) data.bugId = groupChannel.bug.id;
  if (groupChannel.marketItem?.id) data.marketItemId = groupChannel.marketItem.id;

  return {
    type: NotificationType.GROUP_CHAT,
    title,
    body,
    data,
    sound: 'default'
  };
}
