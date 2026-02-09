import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { formatUserName } from '../../shared/notification-base';
import { getShortDayOfWeekForUser } from '../../user-timezone.service';
import { t } from '../../../utils/translations';

export async function createBugChatPushNotification(
  message: any,
  bug: any,
  sender: any,
  recipient: any
): Promise<NotificationPayload | null> {
  const lang = recipient?.language ?? 'en';
  const bugText = (bug.text || 'Bug').substring(0, 50);
  const senderName = formatUserName(sender);
  const messageContent = message.content || '[Media]';
  const shortDayOfWeek = await getShortDayOfWeekForUser(new Date(), recipient?.currentCityId ?? null, lang);

  return {
    type: NotificationType.BUG_CHAT,
    title: `🐛 ${t('notifications.bugReport', lang)}: ${bugText}`,
    body: `${senderName}: ${messageContent}`,
    data: {
      bugId: bug.id,
      messageId: message.id,
      shortDayOfWeek
    },
    sound: 'default'
  };
}
