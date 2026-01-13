import * as admin from 'firebase-admin';
import { config } from '../../config/env';
import { PushTokenService } from './push-token.service';
import { NotificationPayload } from '../../types/notifications.types';

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

      console.log(`[FCM] Sending message to Firebase...`);
      const response = await admin.messaging().send(message);

      if (response) {
        console.log(`[FCM] ✅ Notification sent successfully, message ID: ${response}`);
        return true;
      }

      console.log(`[FCM] ❌ No response from Firebase`);
      return false;
    } catch (error: any) {
      console.error('[FCM] ❌ Exception while sending Android notification:', error);
      console.error('[FCM] Error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack
      });

      if (error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered') {
        console.log(`[FCM] Removing invalid token`);
        await PushTokenService.removeInvalidToken(token);
      }

      return false;
    }
  }
}

export default new FCMService();
