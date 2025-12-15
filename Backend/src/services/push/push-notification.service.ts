import apn from 'apn';
import { config } from '../../config/env';
import { PushTokenService } from './push-token.service';
import { NotificationPayload } from '../../types/notifications.types';
import { PushPlatform } from '@prisma/client';

class PushNotificationService {
  private apnProvider: apn.Provider | null = null;

  initialize() {
    if (!config.apns.keyId || !config.apns.teamId || !config.apns.bundleId || !config.apns.keyPath) {
      console.log('APNs configuration missing, push notifications disabled');
      return;
    }

    try {
      this.apnProvider = new apn.Provider({
        token: {
          key: config.apns.keyPath,
          keyId: config.apns.keyId,
          teamId: config.apns.teamId
        },
        production: config.apns.production
      });
      console.log('✅ APNs Provider initialized');
    } catch (error) {
      console.error('❌ Failed to initialize APNs Provider:', error);
    }
  }

  async sendIOSNotification(token: string, payload: NotificationPayload): Promise<boolean> {
    if (!this.apnProvider) {
      console.log('APNs Provider not initialized');
      return false;
    }

    try {
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

      const result = await this.apnProvider.send(notification, token);

      if (result.failed && result.failed.length > 0) {
        const failure = result.failed[0];
        console.error('APNs notification failed:', failure.response);

        if (failure.status === '410' || failure.status === '400') {
          await PushTokenService.removeInvalidToken(token);
        }
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error sending iOS notification:', error);
      return false;
    }
  }

  async sendIOSNotificationToUser(userId: string, payload: NotificationPayload): Promise<number> {
    const tokens = await PushTokenService.getUserTokens(userId, PushPlatform.IOS);
    
    if (tokens.length === 0) {
      return 0;
    }

    let successCount = 0;
    for (const tokenRecord of tokens) {
      const success = await this.sendIOSNotification(tokenRecord.token, payload);
      if (success) {
        successCount++;
      }
    }

    return successCount;
  }

  async sendAndroidNotification(_token: string, _payload: NotificationPayload): Promise<boolean> {
    console.log('Android push notifications not implemented yet');
    return false;
  }

  async sendWebNotification(_token: string, _payload: NotificationPayload): Promise<boolean> {
    console.log('Web push notifications not implemented yet');
    return false;
  }

  async sendNotificationToUser(userId: string, payload: NotificationPayload): Promise<number> {
    const iosCount = await this.sendIOSNotificationToUser(userId, payload);
    return iosCount;
  }

  shutdown() {
    if (this.apnProvider) {
      this.apnProvider.shutdown();
    }
  }
}

export default new PushNotificationService();
