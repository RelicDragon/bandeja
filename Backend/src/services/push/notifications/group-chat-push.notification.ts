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

function getGroupNotificationTitle(groupChannel: any, lang: string): string {
  const name = groupChannel.bug?.id
    ? truncateBugNotificationTitle(groupChannel.name)
    : groupChannel.name;
  if (groupChannel.bug?.id) return `🐛 ${t('notifications.bugReport', lang)}: ${name}`;
  if (groupChannel.marketItem?.id) return `🛒 ${t('notifications.marketplaceListing', lang)}: ${name}`;
  if (groupChannel.isChannel) return `📢 ${t('notifications.channel', lang)}: ${name}`;
  return `👥 ${t('notifications.group', lang)}: ${name}`;
}

function senderPushFields(sender: { firstName?: string | null; lastName?: string | null; avatar?: string | null }) {
  const fields: Record<string, string> = { senderName: formatUserName(sender) };
  if (sender.avatar?.trim()) {
    fields.senderAvatarUrl = sender.avatar.trim();
  }
  return fields;
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
  const lang = (recipient?.language ?? 'en').split('-')[0].toLowerCase();
  const preview = resolveChatNotificationMediaPreview(message, lang);

  const title = getGroupNotificationTitle(groupChannel, lang);
  const body = `${senderName}: ${preview.body}`;

  const legacyFields: Record<string, string> = {
    groupChannelId: groupChannel.id,
    ...senderPushFields(sender),
  };
  if (groupChannel.bug?.id) legacyFields.bugId = groupChannel.bug.id;
  if (groupChannel.marketItem?.id) legacyFields.marketItemId = groupChannel.marketItem.id;

  const reply = withChatPushReplyPayload('GROUP', groupChannel.id, message.id, legacyFields, lang);

  return {
    type: NotificationType.GROUP_CHAT,
    title,
    body,
    data: mergeMediaPreviewIntoNotificationData(reply.data, preview),
    actions: reply.actions,
    sound: 'default',
  };
}
