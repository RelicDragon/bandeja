import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import {
  formatUserName,
  truncateBugNotificationTitle,
} from '../../shared/notification-base';
import {
  mergeMediaPreviewIntoNotificationData,
  resolveChatNotificationMediaPreview,
} from '../../shared/chat-notification-media-preview';
import { t } from '../../../utils/translations';
import { withChatPushReplyPayload } from './chat-push-reply.utils';

function senderPushFields(sender: { firstName?: string | null; lastName?: string | null; avatar?: string | null }) {
  const fields: Record<string, string> = { senderName: formatUserName(sender) };
  if (sender.avatar?.trim()) {
    fields.senderAvatarUrl = sender.avatar.trim();
  }
  return fields;
}

export async function createBugChatPushNotification(
  message: any,
  bug: any,
  sender: any,
  recipient: any
): Promise<NotificationPayload | null> {
  const lang = (recipient?.language ?? 'en').split('-')[0].toLowerCase();
  const bugText = truncateBugNotificationTitle(bug.text);
  const senderName = formatUserName(sender);
  const preview = resolveChatNotificationMediaPreview(message, lang);

  const reply = withChatPushReplyPayload(
    'BUG',
    bug.id,
    message.id,
    {
      bugId: bug.id,
      ...senderPushFields(sender),
    },
    lang
  );

  return {
    type: NotificationType.BUG_CHAT,
    title: `🐛 ${t('notifications.bugReport', lang)}: ${bugText}`,
    body: `${senderName}: ${preview.body}`,
    data: mergeMediaPreviewIntoNotificationData(reply.data, preview),
    actions: reply.actions,
    sound: 'default',
  };
}
