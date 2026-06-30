import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import api from '@/api/axios';
import { chatApi } from '@/api/chat';
import { restoreAuthIfNeeded } from '@/utils/authPersistence';
import { getTokenNative } from '@/services/authBridge';
import { useAuthStore } from '@/store/authStore';
import { useNetworkStore } from '@/utils/networkStatus';
import { hasExplicitLogoutMarker } from '@/utils/authExplicitLogout';
import i18n from '@/i18n/config';
import type { PushChatContext } from './parsePushChatContext';
import { PUSH_REPLY_MAX_CONTENT_LENGTH } from './pushNotificationConstants';
import { markPushReplyContextAsRead } from './markPushReplyContextAsRead';
import { syncAppBadgeAfterPushReply } from './syncAppBadgeAfterPushReply';
import { buildPushReplyClientMutationId } from './pushReplyClientMutationId';

const LOG_PREFIX = '[push-reply]';

const inflightPushReplies = new Map<string, Promise<boolean>>();

function inflightPushReplyKey(ctx: PushChatContext, content: string): string {
  if (ctx.replyToken) {
    return `token:${ctx.replyToken}`;
  }
  return `msg:${ctx.messageId}:${content}`;
}

export { PUSH_REPLY_MAX_CONTENT_LENGTH };

export function truncatePushReplyContent(content: string): string {
  if (content.length <= PUSH_REPLY_MAX_CONTENT_LENGTH) {
    return content;
  }
  return content.slice(0, PUSH_REPLY_MAX_CONTENT_LENGTH);
}

async function isDeviceOffline(): Promise<boolean> {
  if (!useNetworkStore.getState().isOnline) {
    return true;
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const status = await Network.getStatus();
      return !status.connected;
    } catch {
      return false;
    }
  }

  return typeof navigator !== 'undefined' && !navigator.onLine;
}

async function scheduleReplyFailedNotification(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Date.now() % 2_147_483_647),
          title: i18n.t('push.replyFailed'),
          body: '',
          sound: 'default',
        },
      ],
    });
  } catch (error) {
    console.warn(`${LOG_PREFIX} failed to schedule local error notification`, error);
  }
}

async function ensureAuthToken(): Promise<boolean> {
  restoreAuthIfNeeded();
  if (hasExplicitLogoutMarker()) {
    return false;
  }

  let token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  if (!token && Capacitor.getPlatform() === 'ios') {
    token = await getTokenNative();
    if (token && typeof localStorage !== 'undefined') {
      localStorage.setItem('token', token);
      useAuthStore.getState().setToken(token);
    }
  }

  return !!token;
}

function logReplyEvent(
  chatContextType: string,
  actionId: string,
  detail: string,
  extra?: Record<string, unknown>
): void {
  console.log(`${LOG_PREFIX} ${detail}`, {
    chatContextType,
    actionId,
    platform: Capacitor.getPlatform(),
    ...extra,
  });
}

async function afterSuccessfulPushReply(ctx: PushChatContext, unreadBadgeCount?: number): Promise<void> {
  markPushReplyContextAsRead(ctx);
  await syncAppBadgeAfterPushReply(unreadBadgeCount);
}

async function sendChatReplyFromPushOnce(
  ctx: PushChatContext,
  trimmed: string
): Promise<boolean> {
  const actionId = 'reply';
  const clientMutationId = await buildPushReplyClientMutationId(ctx, trimmed);

  if (await isDeviceOffline()) {
    logReplyEvent(ctx.chatContextType, actionId, 'offline');
    await scheduleReplyFailedNotification();
    return false;
  }

  if (ctx.replyToken) {
    try {
      const response = await api.post<{ unreadBadgeCount?: number }>('/chat/push-reply', {
        replyToken: ctx.replyToken,
        content: trimmed,
        clientMutationId,
      });
      const unreadBadgeCount = response.data?.unreadBadgeCount;
      await afterSuccessfulPushReply(
        ctx,
        typeof unreadBadgeCount === 'number' ? unreadBadgeCount : undefined
      );
      logReplyEvent(ctx.chatContextType, actionId, 'success token-path');
      return true;
    } catch (error: unknown) {
      const status =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { status?: number } }).response?.status
          : undefined;
      logReplyEvent(ctx.chatContextType, actionId, 'token-path failed', { status });
      await scheduleReplyFailedNotification();
      return false;
    }
  }

  const hasToken = await ensureAuthToken();
  if (!hasToken) {
    logReplyEvent(ctx.chatContextType, actionId, 'no auth token');
    await scheduleReplyFailedNotification();
    return false;
  }

  try {
    await chatApi.createMessage({
      chatContextType: ctx.chatContextType as 'USER' | 'GAME' | 'GROUP' | 'BUG',
      contextId: ctx.contextId,
      content: trimmed,
      mediaUrls: [],
      replyToId: ctx.messageId,
      chatType: (ctx.chatType as 'PUBLIC' | 'PRIVATE' | undefined) ?? 'PUBLIC',
      clientMutationId,
    });
    await chatApi.confirmMessageReceipt(ctx.messageId, 'push');
    await afterSuccessfulPushReply(ctx);
    logReplyEvent(ctx.chatContextType, actionId, 'success jwt-path');
    return true;
  } catch (error: unknown) {
    const status =
      error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { status?: number } }).response?.status
        : undefined;
    logReplyEvent(ctx.chatContextType, actionId, 'jwt-path failed', { status });
    await scheduleReplyFailedNotification();
    return false;
  }
}

export async function sendChatReplyFromPush(
  ctx: PushChatContext,
  content: string
): Promise<boolean> {
  const trimmed = truncatePushReplyContent(content.trim());
  if (!trimmed) return false;

  const key = inflightPushReplyKey(ctx, trimmed);
  const existing = inflightPushReplies.get(key);
  if (existing) {
    return existing;
  }

  const promise = sendChatReplyFromPushOnce(ctx, trimmed).finally(() => {
    if (inflightPushReplies.get(key) === promise) {
      inflightPushReplies.delete(key);
    }
  });
  inflightPushReplies.set(key, promise);
  return promise;
}
