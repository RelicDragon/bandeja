import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { formatUserName } from '../../shared/notification-base';
import { t } from '../../../utils/translations';

function getGroupNotificationTitle(groupChannel: any, lang: string): string {
  const name = groupChannel.name;
  if (groupChannel.bug?.id) return `🐛 ${t('notifications.bugReport', lang)}: ${name}`;
  if (groupChannel.marketItem?.id) return `🛒 ${t('notifications.marketplaceListing', lang)}: ${name}`;
  if (groupChannel.isChannel) return `📢 ${t('notifications.channel', lang)}: ${name}`;
  return `👥 ${t('notifications.group', lang)}: ${name}`;
}

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
  const lang = recipient?.language ?? 'en';

  const title = getGroupNotificationTitle(groupChannel, lang);
  const body = `${senderName}: ${messageContent}`;

  const data: Record<string, string> = {
    groupChannelId: groupChannel.id,
    messageId: message.id
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
