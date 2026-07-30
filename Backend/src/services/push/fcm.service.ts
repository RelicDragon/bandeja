import * as admin from 'firebase-admin';
import { config } from '../../config/env';
import { PushTokenService } from './push-token.service';
import { NotificationPayload, NotificationType } from '../../types/notifications.types';
import {
  hasFullChatReplyContext,
  isReplyableChatNotificationType,
} from './notifications/chat-push-reply.utils';
import { deliveryCollapseKey } from './deliveryCollapseKey';

const DATA_ONLY_ANDROID_TYPES = new Set<NotificationType>([
  NotificationType.USER_CHAT,
  NotificationType.GAME_CHAT,
  NotificationType.GROUP_CHAT,
  NotificationType.BUG_CHAT,
  NotificationType.INVITE,
  NotificationType.TEAM_INVITE,
  NotificationType.FOLLOWED_USER_PLAY_INTENT,
]);

function isValidHttpsPreviewUrl(url: string | undefined): url is string {
  if (!url?.trim()) {
    return false;
  }
  try {
    return new URL(url.trim()).protocol === 'https:';
  } catch {
    return false;
  }
}

function usesDataOnlyPath(payload: NotificationPayload): boolean {
  if (!DATA_ONLY_ANDROID_TYPES.has(payload.type)) {
    return false;
  }
  if (isReplyableChatNotificationType(payload.type)) {
    return hasFullChatReplyContext(payload.data as Record<string, unknown>);
  }
  return true;
}

function buildDataMap(payload: NotificationPayload): Record<string, string> {
  const data: Record<string, string> = {
    type: payload.type,
    title: payload.title,
    body: payload.body,
    ...(payload.data
      ? Object.fromEntries(
          Object.entries(payload.data).map(([key, value]) => [key, String(value ?? '')])
        )
      : {}),
  };
  if (payload.category) {
    data.category = payload.category;
  }
  if (payload.threadId) {
    data.threadId = payload.threadId;
    data.conversationKey = payload.threadId;
  }
  if (payload.badge !== undefined && Number.isFinite(payload.badge)) {
    data.unreadBadgeCount = String(Math.max(0, Math.floor(payload.badge)));
  } else if (payload.data?.unreadBadgeCount !== undefined) {
    data.unreadBadgeCount = String(Math.max(0, Math.floor(payload.data.unreadBadgeCount)));
  }
  if (
    isReplyableChatNotificationType(payload.type) &&
    hasFullChatReplyContext(payload.data as Record<string, unknown>)
  ) {
    data.nativeHandler = 'chat_reply';
  }
  if (payload.type === NotificationType.INVITE || payload.type === NotificationType.TEAM_INVITE) {
    data.nativeHandler = 'invite_actions';
  }
  if (payload.type === NotificationType.FOLLOWED_USER_PLAY_INTENT) {
    data.nativeHandler = 'play_intent_actions';
  }
  return data;
}

export function buildFcmMessage(
  token: string,
  payload: NotificationPayload
): admin.messaging.TokenMessage {
  const dataOnly = usesDataOnlyPath(payload);
  const data = buildDataMap(payload);
  const previewImageUrl = payload.data?.previewImageUrl;
  const hasPreviewImage = isValidHttpsPreviewUrl(previewImageUrl);
  const collapseKey = deliveryCollapseKey(payload.data?.deliveryKey);

  const androidNotification: admin.messaging.AndroidNotification = {
    ...(dataOnly ? {} : { sound: payload.sound || 'default', channelId: 'default' }),
    ...(hasPreviewImage ? { imageUrl: previewImageUrl } : {}),
  };

  const hasAndroidNotification = Object.keys(androidNotification).length > 0;

  return {
    token,
    data,
    android: {
      priority: 'high' as const,
      ...(collapseKey ? { collapseKey } : {}),
      ...(hasAndroidNotification ? { notification: androidNotification } : {}),
    },
    ...(dataOnly
      ? {}
      : {
          notification: {
            title: payload.title,
            body: payload.body,
          },
        }),
  };
}

export function buildFcmMulticastMessage(
  tokens: string[],
  payload: NotificationPayload
): admin.messaging.MulticastMessage {
  const message = buildFcmMessage(tokens[0] ?? '', payload);
  return {
    tokens,
    ...(message.data ? { data: message.data } : {}),
    ...(message.notification ? { notification: message.notification } : {}),
    ...(message.android ? { android: message.android } : {}),
    ...(message.apns ? { apns: message.apns } : {}),
    ...(message.webpush ? { webpush: message.webpush } : {}),
    ...(message.fcmOptions ? { fcmOptions: message.fcmOptions } : {}),
  };
}

class FCMService {
  private isInitialized = false;

  initialize() {
    if (!config.fcm.projectId || !config.fcm.privateKey || !config.fcm.clientEmail) {
      console.log('[FCM] ⚠️  FCM configuration missing, Android push notifications disabled');
      console.log('[FCM] Missing config:', {
        projectId: !!config.fcm.projectId,
        privateKey: !!config.fcm.privateKey,
        clientEmail: !!config.fcm.clientEmail
      });
      return;
    }

    try {
      console.log('[FCM] Initializing Firebase Admin SDK...');
      console.log('[FCM] Config:', {
        projectId: config.fcm.projectId,
        clientEmail: config.fcm.clientEmail,
        hasPrivateKey: !!config.fcm.privateKey
      });

      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: config.fcm.projectId,
            privateKey: config.fcm.privateKey,
            clientEmail: config.fcm.clientEmail,
          }),
        });
        console.log('[FCM] Firebase Admin app created');
      } else {
        console.log('[FCM] Firebase Admin app already exists, reusing');
      }

      this.isInitialized = true;
      console.log('[FCM] ✅ FCM Admin SDK initialized successfully');
    } catch (error) {
      console.error('[FCM] ❌ Failed to initialize FCM Admin SDK:', error);
      console.error('[FCM] Error details:', error instanceof Error ? error.stack : error);
    }
  }

  async sendNotification(token: string, payload: NotificationPayload): Promise<boolean> {
    return (await this.sendNotifications([token], payload)) === 1;
  }

  async sendNotifications(
    tokens: string[],
    payload: NotificationPayload
  ): Promise<number> {
    if (!this.isInitialized) {
      console.log('[FCM] Admin SDK not initialized, skipping Android notification');
      return 0;
    }

    const uniqueTokens = [...new Set(tokens.filter(Boolean))];
    let successCount = 0;
    for (let offset = 0; offset < uniqueTokens.length; offset += 500) {
      const batchTokens = uniqueTokens.slice(offset, offset + 500);
      try {
        const message = buildFcmMulticastMessage(batchTokens, payload);
        const response = await admin.messaging().sendEachForMulticast(message);
        successCount += response.successCount;

        const staleTokens: string[] = [];
        response.responses.forEach((result, index) => {
          if (result.success) return;
          const code = result.error?.code;
          if (
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/registration-token-not-registered'
          ) {
            staleTokens.push(batchTokens[index]);
          } else {
            console.error('[FCM] Notification failed:', {
              token: `${batchTokens[index]?.substring(0, 20)}...`,
              code,
              message: result.error?.message,
            });
          }
        });
        await Promise.allSettled(
          staleTokens.map((token) => PushTokenService.removeInvalidToken(token))
        );
      } catch (error: unknown) {
        const err = error as { code?: string; message?: string; stack?: string };
        console.error('[FCM] ❌ Exception sending Android notification batch:', {
          code: err.code,
          message: err.message,
          stack: err.stack,
          batchSize: batchTokens.length,
        });
      }
    }
    return successCount;
  }
}

export default new FCMService();
