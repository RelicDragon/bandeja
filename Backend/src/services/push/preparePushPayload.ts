import { ChatContextType, ChatType } from '@prisma/client';
import { NotificationPayload, NotificationType } from '../../types/notifications.types';
import { UnreadCheapTotalsService } from '../chat/unreadCheapTotals.service';
import {
  hasFullChatReplyContext,
  PUSH_CATEGORY_CHAT_REPLY,
  resolveApnsNotificationCategory,
} from './notifications/chat-push-reply.utils';
import { PushReplyTokenService } from './pushReplyToken.service';
import { shouldAttachPushUnreadBadge, withPushUnreadBadge } from './pushUnreadBadge';

const INVITE_ACTION_TYPES = new Set<NotificationType>([
  NotificationType.INVITE,
  NotificationType.TEAM_INVITE,
]);

function pushThreadId(
  chatContextType: string,
  contextId: string,
  chatType?: string | null
): string {
  switch (chatContextType) {
    case 'USER':
      return `user-chat:${contextId}`;
    case 'GAME':
      return `game-chat:${contextId}:${chatType ?? ChatType.PUBLIC}`;
    case 'GROUP':
      return `group:${contextId}`;
    case 'BUG':
      return `bug:${contextId}`;
    default:
      return `${chatContextType}:${contextId}`;
  }
}

function resolvePushThreadId(payload: NotificationPayload): string | undefined {
  const data = payload.data;
  if (!data) return undefined;

  switch (payload.type) {
    case NotificationType.USER_CHAT:
      if (data.userChatId) return `user-chat:${data.userChatId}`;
      break;
    case NotificationType.GAME_CHAT:
      if (data.gameId) return `game-chat:${data.gameId}:${data.chatType ?? ChatType.PUBLIC}`;
      break;
    case NotificationType.GROUP_CHAT:
      if (data.groupChannelId) return `group:${data.groupChannelId}`;
      break;
    case NotificationType.BUG_CHAT:
      if (data.bugId) return `bug:${data.bugId}`;
      break;
    default:
      break;
  }

  if (data.chatContextType && data.contextId) {
    return pushThreadId(data.chatContextType, data.contextId, data.chatType);
  }

  return undefined;
}

export async function preparePushPayloadForRecipient(
  userId: string,
  payload: NotificationPayload
): Promise<NotificationPayload> {
  let next: NotificationPayload = {
    ...payload,
    category: resolveApnsNotificationCategory(payload),
  };

  if (next.category === PUSH_CATEGORY_CHAT_REPLY && hasFullChatReplyContext(next.data as Record<string, unknown>)) {
    const data = next.data!;
    const replyToken = await PushReplyTokenService.generate({
      recipientUserId: userId,
      chatContextType: data.chatContextType as ChatContextType,
      contextId: data.contextId!,
      messageId: data.messageId!,
      chatType: (data.chatType as ChatType | undefined) ?? null,
    });
    const threadId =
      resolvePushThreadId(next) ??
      pushThreadId(data.chatContextType!, data.contextId!, data.chatType);
    next = {
      ...next,
      threadId,
      data: { ...data, replyToken, conversationKey: threadId },
    };
  }

  if (INVITE_ACTION_TYPES.has(next.type) && next.actions?.length) {
    const accept = next.actions.find((a) => a.id === 'accept');
    const decline = next.actions.find((a) => a.id === 'decline');
    next = {
      ...next,
      data: {
        ...next.data,
        acceptActionTitle: accept?.title,
        declineActionTitle: decline?.title,
      },
    };
  }

  if (shouldAttachPushUnreadBadge(next)) {
    const { total } = await UnreadCheapTotalsService.getTotalsWithRevision(userId);
    next = withPushUnreadBadge(next, total);
  }

  return next;
}
