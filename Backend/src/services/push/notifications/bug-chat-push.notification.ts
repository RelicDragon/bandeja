import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import {
  formatChatNotificationMessageBody,
  formatUserName,
  truncateBugNotificationTitle,
} from '../../shared/notification-base';
import { t } from '../../../utils/translations';

export async function createBugChatPushNotification(
  message: any,
  bug: any,
  sender: any,
  recipient: any
): Promise<NotificationPayload | null> {
  const lang = recipient?.language ?? 'en';
  const bugText = truncateBugNotificationTitle(bug.text);
  const senderName = formatUserName(sender);
  const messageContent = formatChatNotificationMessageBody(message) || '[Media]';

  return {
    type: NotificationType.BUG_CHAT,
    title: `🐛 ${t('notifications.bugReport', lang)}: ${bugText}`,
    body: `${senderName}: ${messageContent}`,
    data: {
      bugId: bug.id,
      messageId: message.id
    },
    sound: 'default'
  };
}
