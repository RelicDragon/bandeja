import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';

export function createNewBugPushNotification(
  bug: { id: string; text: string; bugType: string },
  groupChannelId: string,
  senderName: string,
  lang: string
): NotificationPayload {
  const bugText = (bug.text || 'Bug').substring(0, 50);
  const title = t('bugs.newBugTitle', lang) || 'New bug report';
  const body = (t('bugs.newBugBody', lang) || '{sender}: {text}')
    .replace('{sender}', senderName)
    .replace('{text}', bugText);

  return {
    type: NotificationType.NEW_BUG,
    title: `🐛 ${title}`,
    body,
    data: {
      bugId: bug.id,
      groupChannelId,
    },
    sound: 'default',
  };
}
