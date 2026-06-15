import {
  NotificationAction,
  NotificationData,
  NotificationPayload,
  NotificationType,
} from '../../../types/notifications.types';
import { t } from '../../../utils/translations';

export type ChatPushContextType = 'USER' | 'GAME' | 'GROUP' | 'BUG';

export const PUSH_ACTION_REPLY = 'reply';
export const PUSH_CATEGORY_CHAT_REPLY = 'CHAT_REPLY';

const CHAT_PUSH_NOTIFICATION_TYPES = new Set<NotificationType>([
  NotificationType.USER_CHAT,
  NotificationType.GAME_CHAT,
  NotificationType.GROUP_CHAT,
  NotificationType.BUG_CHAT,
]);

export function isReplyableChatNotificationType(type: NotificationType | string): boolean {
  return CHAT_PUSH_NOTIFICATION_TYPES.has(type as NotificationType);
}

export function hasFullChatReplyContext(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  return (
    typeof data.chatContextType === 'string' &&
    typeof data.contextId === 'string' &&
    typeof data.messageId === 'string'
  );
}

export function buildChatPushReplyData(
  chatContextType: ChatPushContextType,
  contextId: string,
  messageId: string,
  legacyFields: Record<string, string>,
  chatType?: string
): NotificationData {
  return {
    ...legacyFields,
    chatContextType,
    contextId,
    messageId,
    ...(chatType ? { chatType } : {}),
  };
}

export function buildChatPushReplyActions(lang: string): NotificationAction[] {
  const normalizedLang = (lang ?? 'en').split('-')[0].toLowerCase();
  return [
    {
      id: PUSH_ACTION_REPLY,
      title: t('telegram.reply', normalizedLang),
      action: PUSH_ACTION_REPLY,
      input: true,
    },
  ];
}

export function withChatPushReplyPayload(
  chatContextType: ChatPushContextType,
  contextId: string,
  messageId: string,
  legacyFields: Record<string, string>,
  lang: string,
  chatType?: string
): { data: NotificationData; actions?: NotificationAction[] } {
  if (!chatContextType || !contextId || !messageId) {
    return { data: legacyFields };
  }

  return {
    data: buildChatPushReplyData(chatContextType, contextId, messageId, legacyFields, chatType),
    actions: buildChatPushReplyActions(lang),
  };
}

export function resolveApnsNotificationCategory(payload: NotificationPayload): string | undefined {
  if (!payload.actions?.length) {
    return undefined;
  }

  if (CHAT_PUSH_NOTIFICATION_TYPES.has(payload.type)) {
    return PUSH_CATEGORY_CHAT_REPLY;
  }

  if (payload.type === NotificationType.TEAM_INVITE) {
    return NotificationType.TEAM_INVITE;
  }

  return payload.type;
}
