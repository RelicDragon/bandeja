import apn from 'apn';
import { config } from '../../config/env';
import { PushTokenService } from './push-token.service';
import { NotificationPayload } from '../../types/notifications.types';
import { PushPlatform } from '@prisma/client';
import fcmService from './fcm.service';
import { canDispatchToUser } from '../../utils/notificationDispatchGuard';
import { preparePushPayloadForRecipient } from './preparePushPayload';
import {
  PUSH_CATEGORY_CHAT_REPLY,
  resolveApnsNotificationCategory,
} from './notifications/chat-push-reply.utils';
import { deliveryCollapseKey } from './deliveryCollapseKey';

export function shouldSetApnsMutableContent(
  category: string | undefined,
  previewImageUrl: string | undefined
): boolean {
  if (category === PUSH_CATEGORY_CHAT_REPLY) {
    return true;
  }
  return !!previewImageUrl?.trim() && previewImageUrl.trim().startsWith('https://');
}

type ApnsFailure = {
  status?: number | string;
  response?: { reason?: string };
};

/**
 * APNs uses HTTP 400 for both invalid device tokens and request/configuration
 * mistakes. Only the two token-specific reasons are safe to delete.
 */
export function isDefinitivelyInvalidApnsToken(
  failure: ApnsFailure
): boolean {
  const reason = failure.response?.reason;
  return reason === 'BadDeviceToken' || reason === 'Unregistered';
}

class PushNotificationService {
  private apnProvider: apn.Provider | null = null;

  initialize() {
    console.log('[PUSH] Initializing push notification services...');
    
    if (!config.apns.keyId || !config.apns.teamId || !config.apns.bundleId || !config.apns.keyPath) {
      console.log('[APNS] ⚠️  APNs configuration missing, iOS push notifications disabled');
      console.log('[APNS] Missing config:', {
        keyId: !!config.apns.keyId,
        teamId: !!config.apns.teamId,
        bundleId: !!config.apns.bundleId,
        keyPath: !!config.apns.keyPath
      });
    } else {
      try {
        console.log('[APNS] Initializing APNs Provider...');
        console.log('[APNS] Config:', {
          keyPath: config.apns.keyPath,
          keyId: config.apns.keyId,
          teamId: config.apns.teamId,
          bundleId: config.apns.bundleId,
          production: config.apns.production
        });
        
        this.apnProvider = new apn.Provider({
          token: {
            key: config.apns.keyPath,
            keyId: config.apns.keyId,
            teamId: config.apns.teamId
          },
          production: config.apns.production
        });
        console.log('[APNS] ✅ APNs Provider initialized successfully');
      } catch (error) {
        console.error('[APNS] ❌ Failed to initialize APNs Provider:', error);
        console.error('[APNS] Error details:', error instanceof Error ? error.stack : error);
      }
    }

    console.log('[PUSH] Initializing FCM service...');
    fcmService.initialize();
    console.log('[PUSH] Push notification services initialization complete');
  }

  private buildIOSNotification(payload: NotificationPayload): apn.Notification {
    const notification = new apn.Notification();
    notification.alert = {
      title: payload.title,
      body: payload.body
    };
    notification.topic = config.apns.bundleId;
    notification.sound = payload.sound || 'default';
    const collapseId = deliveryCollapseKey(payload.data?.deliveryKey);
    if (collapseId) {
      notification.collapseId = collapseId;
    }
    if (payload.badge !== undefined) {
      notification.badge = payload.badge;
    }
    notification.payload = {
      type: payload.type,
      data: payload.data || {}
    };

    const resolvedCategory = payload.category ?? resolveApnsNotificationCategory(payload);
    if (resolvedCategory) {
      (notification as apn.Notification & { category?: string }).category = resolvedCategory;
    }
    if (payload.threadId) {
      (notification as apn.Notification & { threadId?: string }).threadId = payload.threadId;
    }
    if (shouldSetApnsMutableContent(resolvedCategory, payload.data?.previewImageUrl)) {
      notification.mutableContent = true;
    }
    return notification;
  }

  async sendIOSNotification(token: string, payload: NotificationPayload): Promise<boolean> {
    return (await this.sendIOSNotifications([token], payload)) === 1;
  }

  async sendIOSNotifications(
    tokens: string[],
    payload: NotificationPayload
  ): Promise<number> {
    if (!this.apnProvider) {
      console.log('[APNS] Provider not initialized, skipping iOS notification');
      return 0;
    }

    const uniqueTokens = [...new Set(tokens.filter(Boolean))];
    if (uniqueTokens.length === 0) return 0;

    try {
      const result = await this.apnProvider.send(
        this.buildIOSNotification(payload),
        uniqueTokens
      );
      const staleFailures = [];
      for (const failure of result.failed ?? []) {
        if (isDefinitivelyInvalidApnsToken(failure)) {
          staleFailures.push(failure);
        } else {
          console.error('[APNS] Notification failed:', {
            token: `${failure.device.substring(0, 20)}...`,
            status: failure.status,
            response: failure.response,
          });
        }
      }
      await Promise.all(
        staleFailures.map(async (failure) => {
          try {
            await PushTokenService.removeInvalidToken(failure.device);
          } catch (error) {
            console.error('[APNS] Failed to remove invalid device token:', {
              token: `${failure.device.substring(0, 20)}...`,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })
      );
      return result.sent?.length ?? 0;
    } catch (error) {
      console.error('[APNS] ❌ Exception sending iOS notification batch:', error);
      console.error('[APNS] Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      return 0;
    }
  }

  async sendIOSNotificationToUser(userId: string, payload: NotificationPayload): Promise<number> {
    console.log(`[APNS] Getting iOS tokens for user: ${userId}`);
    
    let tokens;
    try {
      tokens = await PushTokenService.getUserTokens(userId, PushPlatform.IOS);
    } catch (error) {
      console.error(`[APNS] ❌ Failed to get iOS tokens for user ${userId}:`, error);
      return 0;
    }
    
    console.log(`[APNS] Found ${tokens.length} iOS token(s) for user ${userId}`);
    
    if (tokens.length === 0) {
      return 0;
    }

    const prepared = await preparePushPayloadForRecipient(userId, payload);

    const successCount = await this.sendIOSNotifications(
      tokens.map((token) => token.token),
      prepared
    );

    console.log(`[APNS] Sent to ${successCount}/${tokens.length} iOS device(s) for user ${userId}`);
    return successCount;
  }

  async sendAndroidNotification(token: string, payload: NotificationPayload): Promise<boolean> {
    return await fcmService.sendNotification(token, payload);
  }

  async sendAndroidNotificationToUser(userId: string, payload: NotificationPayload): Promise<number> {
    console.log(`[FCM] Getting Android tokens for user: ${userId}`);
    
    let tokens;
    try {
      tokens = await PushTokenService.getUserTokens(userId, PushPlatform.ANDROID);
    } catch (error) {
      console.error(`[FCM] ❌ Failed to get Android tokens for user ${userId}:`, error);
      return 0;
    }
    
    console.log(`[FCM] Found ${tokens.length} Android token(s) for user ${userId}`);
    
    if (tokens.length === 0) {
      return 0;
    }

    const prepared = await preparePushPayloadForRecipient(userId, payload);

    const successCount = await fcmService.sendNotifications(
      tokens.map((token) => token.token),
      prepared
    );

    console.log(`[FCM] Sent to ${successCount}/${tokens.length} Android device(s) for user ${userId}`);
    return successCount;
  }

  async sendNotificationToUser(userId: string, payload: NotificationPayload): Promise<number> {
    if (!(await canDispatchToUser(userId, 'push', payload.type || 'push'))) {
      return 0;
    }

    console.log(`[PUSH] Sending notification to user ${userId}:`, { title: payload.title, type: payload.type });
    
    let iosCount = 0;
    let androidCount = 0;
    
    try {
      iosCount = await this.sendIOSNotificationToUser(userId, payload);
    } catch (error) {
      console.error(`[PUSH] ❌ Error sending iOS notifications to user ${userId}:`, error);
    }
    
    try {
      androidCount = await this.sendAndroidNotificationToUser(userId, payload);
    } catch (error) {
      console.error(`[PUSH] ❌ Error sending Android notifications to user ${userId}:`, error);
    }
    
    const total = iosCount + androidCount;
    console.log(`[PUSH] Total sent: ${total} (iOS: ${iosCount}, Android: ${androidCount})`);
    
    return total;
  }

  shutdown() {
    if (this.apnProvider) {
      this.apnProvider.shutdown();
    }
  }
}

export default new PushNotificationService();
