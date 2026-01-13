import apn from 'apn';
import { config } from '../../config/env';
import { PushTokenService } from './push-token.service';
import { NotificationPayload } from '../../types/notifications.types';
import { PushPlatform } from '@prisma/client';
import fcmService from './fcm.service';

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

  async sendIOSNotification(token: string, payload: NotificationPayload): Promise<boolean> {
    if (!this.apnProvider) {
      console.log('[APNS] Provider not initialized, skipping iOS notification');
      return false;
    }

    try {
      console.log(`[APNS] Preparing to send notification to token: ${token.substring(0, 20)}...`);
      console.log(`[APNS] Payload:`, { title: payload.title, type: payload.type });

      const notification = new apn.Notification();
      notification.alert = {
        title: payload.title,
        body: payload.body
      };
      notification.topic = config.apns.bundleId;
      notification.sound = payload.sound || 'default';
      if (payload.badge !== undefined) {
        notification.badge = payload.badge;
      }
      notification.payload = {
        type: payload.type,
        data: payload.data || {}
      };

      if (payload.actions && payload.actions.length > 0) {
        (notification as any).category = payload.type;
      }

      console.log(`[APNS] Sending notification with topic: ${config.apns.bundleId}`);
      const result = await this.apnProvider.send(notification, token);

      console.log(`[APNS] Send result:`, {
        sent: result.sent?.length || 0,
        failed: result.failed?.length || 0
      });

      if (result.failed && result.failed.length > 0) {
        const failure = result.failed[0];
        console.error(`[APNS] ❌ Notification failed:`, {
          token: token.substring(0, 20) + '...',
          status: failure.status,
          response: failure.response
        });

        if (failure.status === '410' || failure.status === '400') {
          console.log(`[APNS] Removing invalid token`);
          await PushTokenService.removeInvalidToken(token);
        }
        return false;
      }

      console.log(`[APNS] ✅ Notification sent successfully`);
      return true;
    } catch (error) {
      console.error('[APNS] ❌ Exception while sending iOS notification:', error);
      console.error('[APNS] Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      return false;
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

    let successCount = 0;
    for (let i = 0; i < tokens.length; i++) {
      const tokenRecord = tokens[i];
      console.log(`[APNS] Sending to iOS token ${i + 1}/${tokens.length} (deviceId: ${tokenRecord.deviceId || 'unknown'})`);
      
      try {
        const success = await this.sendIOSNotification(tokenRecord.token, payload);
        if (success) {
          successCount++;
          console.log(`[APNS] ✅ Success for token ${i + 1}/${tokens.length}`);
        } else {
          console.log(`[APNS] ❌ Failed for token ${i + 1}/${tokens.length}`);
        }
      } catch (error) {
        console.error(`[APNS] ❌ Exception sending to token ${i + 1}/${tokens.length}:`, error);
      }
    }

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

    let successCount = 0;
    for (let i = 0; i < tokens.length; i++) {
      const tokenRecord = tokens[i];
      console.log(`[FCM] Sending to Android token ${i + 1}/${tokens.length} (deviceId: ${tokenRecord.deviceId || 'unknown'})`);
      
      try {
        const success = await this.sendAndroidNotification(tokenRecord.token, payload);
        if (success) {
          successCount++;
          console.log(`[FCM] ✅ Success for token ${i + 1}/${tokens.length}`);
        } else {
          console.log(`[FCM] ❌ Failed for token ${i + 1}/${tokens.length}`);
        }
      } catch (error) {
        console.error(`[FCM] ❌ Exception sending to token ${i + 1}/${tokens.length}:`, error);
      }
    }

    console.log(`[FCM] Sent to ${successCount}/${tokens.length} Android device(s) for user ${userId}`);
    return successCount;
  }

  async sendWebNotification(_token: string, _payload: NotificationPayload): Promise<boolean> {
    console.log('Web push notifications not implemented yet');
    return false;
  }

  async sendNotificationToUser(userId: string, payload: NotificationPayload): Promise<number> {
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
