import * as admin from 'firebase-admin';
import { config } from '../../config/env';
import { PushTokenService } from './push-token.service';
import { NotificationPayload, NotificationType } from '../../types/notifications.types';
import {
  hasFullChatReplyContext,
  isReplyableChatNotificationType,
} from './notifications/chat-push-reply.utils';

const DATA_ONLY_ANDROID_TYPES = new Set<NotificationType>([
  NotificationType.USER_CHAT,
  NotificationType.GAME_CHAT,
  NotificationType.GROUP_CHAT,
  NotificationType.BUG_CHAT,
  NotificationType.INVITE,
  NotificationType.TEAM_INVITE,
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
  return data;
}

export function buildFcmMessage(
  token: string,
  payload: NotificationPayload
): admin.messaging.Message {
  const dataOnly = usesDataOnlyPath(payload);
  const data = buildDataMap(payload);
  const previewImageUrl = payload.data?.previewImageUrl;
  const hasPreviewImage = isValidHttpsPreviewUrl(previewImageUrl);

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
    if (!this.isInitialized) {
      console.log('[FCM] Admin SDK not initialized, skipping Android notification');
      return false;
    }

    try {
      console.log(`[FCM] Preparing to send notification to token: ${token.substring(0, 20)}...`);
      console.log(`[FCM] Payload:`, { title: payload.title, type: payload.type });

      const dataOnly = usesDataOnlyPath(payload);
      const message = buildFcmMessage(token, payload);

      console.log(`[FCM] Sending message to Firebase (${dataOnly ? 'data-only' : 'notification'})...`);
      const response = await admin.messaging().send(message);

      if (response) {
        console.log(`[FCM] ✅ Notification sent successfully, message ID: ${response}`);
        return true;
      }

      console.log(`[FCM] ❌ No response from Firebase`);
      return false;
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string; stack?: string };
      console.error('[FCM] ❌ Exception while sending Android notification:', error);
      console.error('[FCM] Error details:', {
        code: err.code,
        message: err.message,
        stack: err.stack
      });

      if (err.code === 'messaging/invalid-registration-token' ||
          err.code === 'messaging/registration-token-not-registered') {
        console.log(`[FCM] Removing invalid token`);
        await PushTokenService.removeInvalidToken(token);
      }

      return false;
    }
  }
}

export default new FCMService();
