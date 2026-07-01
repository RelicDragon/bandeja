import { NotificationPayload, NotificationType } from '../../types/notifications.types';

export const CHAT_PUSH_TYPES_WITH_UNREAD_BADGE = new Set<NotificationType>([
  NotificationType.USER_CHAT,
  NotificationType.GAME_CHAT,
  NotificationType.GROUP_CHAT,
  NotificationType.BUG_CHAT,
]);

export function withPushUnreadBadge(payload: NotificationPayload, total: number): NotificationPayload {
  const safe = Math.max(0, Math.floor(total));
  return {
    ...payload,
    badge: safe,
    data: {
      ...payload.data,
      unreadBadgeCount: safe,
    },
  };
}

export function shouldAttachPushUnreadBadge(payload: NotificationPayload): boolean {
  return CHAT_PUSH_TYPES_WITH_UNREAD_BADGE.has(payload.type) && payload.badge === undefined;
}
