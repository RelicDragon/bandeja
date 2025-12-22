import { NotificationPayload, NotificationType } from '../../../types/notifications.types';

export async function createBugChatPushNotification(
  message: any,
  bug: any,
  sender: any,
  _recipient: any
): Promise<NotificationPayload | null> {
  const bugText = (bug.text || 'Bug').substring(0, 50);
  const senderName = `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || 'Unknown';
  const messageContent = message.content || '[Media]';

  return {
    type: NotificationType.BUG_CHAT,
    title: `🐛 ${bugText}`,
    body: `${senderName}: ${messageContent}`,
    data: {
      bugId: bug.id,
      messageId: message.id
    },
    sound: 'default'
  };
}
