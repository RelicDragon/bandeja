import * as admin from 'firebase-admin';
import { config } from '../../config/env';
import { PushTokenService } from './push-token.service';
import { NotificationPayload } from '../../types/notifications.types';

class FCMService {
  private isInitialized = false;

  initialize() {
    if (!config.fcm.projectId || !config.fcm.privateKey || !config.fcm.clientEmail) {
      console.log('FCM configuration missing, Android push notifications disabled');
      return;
    }

    try {
      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: config.fcm.projectId,
            privateKey: config.fcm.privateKey,
            clientEmail: config.fcm.clientEmail,
          }),
        });
      }
      this.isInitialized = true;
      console.log('✅ FCM Admin SDK initialized');
    } catch (error) {
      console.error('❌ Failed to initialize FCM Admin SDK:', error);
    }
  }

  async sendNotification(token: string, payload: NotificationPayload): Promise<boolean> {
    if (!this.isInitialized) {
      console.log('FCM Admin SDK not initialized');
      return false;
    }

    try {
      const message: admin.messaging.Message = {
        token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: {
          type: payload.type,
          ...(payload.data ? Object.fromEntries(
            Object.entries(payload.data).map(([key, value]) => [key, String(value ?? '')])
          ) : {}),
        },
        android: {
          priority: 'high' as const,
          notification: {
            sound: payload.sound || 'default',
            channelId: 'default',
          },
        },
      };

      const response = await admin.messaging().send(message);

      if (response) {
        return true;
      }

      return false;
    } catch (error: any) {
      console.error('Error sending Android notification:', error);

      if (error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered') {
        await PushTokenService.removeInvalidToken(token);
      }

      return false;
    }
  }
}

export default new FCMService();
