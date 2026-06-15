import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { formatUserName } from '../../shared/notification-base';
import {
  mergeMediaPreviewIntoNotificationData,
  resolveChatNotificationMediaPreview,
} from '../../shared/chat-notification-media-preview';
import { withChatPushReplyPayload } from './chat-push-reply.utils';

function senderPushFields(sender: { firstName?: string | null; lastName?: string | null; avatar?: string | null }) {
  const fields: Record<string, string> = { senderName: formatUserName(sender) };
  if (sender.avatar?.trim()) {
    fields.senderAvatarUrl = sender.avatar.trim();
  }
  return fields;
}

export async function createUserChatPushNotification(
  message: any,
  userChat: any,
  sender: any,
  recipient: any
): Promise<NotificationPayload | null> {
  const senderName = formatUserName(sender);
  const lang = (recipient?.language ?? 'en').split('-')[0].toLowerCase();
  const preview = resolveChatNotificationMediaPreview(message, lang);

  const reply = withChatPushReplyPayload(
    'USER',
    userChat.id,
    message.id,
    {
      userId: sender.id,
      userChatId: userChat.id,
      ...senderPushFields(sender),
    },
    lang
  );

  return {
    type: NotificationType.USER_CHAT,
    title: senderName,
    body: preview.body,
    data: mergeMediaPreviewIntoNotificationData(reply.data, preview),
    actions: reply.actions,
    sound: 'default',
  };
}
