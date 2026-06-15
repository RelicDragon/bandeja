import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import {
  formatGameContextHeader,
  formatGameInfoForUser,
  formatUserName,
  getEntityTypeLabel,
} from '../../shared/notification-base';
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

export async function createGameChatPushNotification(
  message: any,
  game: any,
  sender: any,
  recipient: any
): Promise<NotificationPayload | null> {
  const lang = (recipient?.language ?? 'en').split('-')[0].toLowerCase();
  const senderName = formatUserName(sender);
  const preview = resolveChatNotificationMediaPreview(message, lang);
  const gameInfo = await formatGameInfoForUser(game, recipient.currentCityId, lang);
  const entityLabel = getEntityTypeLabel(game.entityType, lang);

  const baseTitle = formatGameContextHeader(gameInfo, { includeDuration: false });
  const title = entityLabel ? `${entityLabel}: ${baseTitle}` : baseTitle;
  const body = `${senderName}: ${preview.body}`;

  const reply = withChatPushReplyPayload(
    'GAME',
    game.id,
    message.id,
    {
      gameId: game.id,
      chatType: message.chatType,
      shortDayOfWeek: gameInfo.shortDayOfWeek,
      ...senderPushFields(sender),
    },
    lang,
    message.chatType
  );

  return {
    type: NotificationType.GAME_CHAT,
    title,
    body,
    data: mergeMediaPreviewIntoNotificationData(reply.data, preview),
    actions: reply.actions,
    sound: 'default',
  };
}
