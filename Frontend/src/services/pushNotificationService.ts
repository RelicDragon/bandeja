import { PushNotifications, PushNotificationSchema, ActionPerformed, Token } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import api from '@/api/axios';
import { invitesApi } from '@/api/invites';

interface NotificationData {
  type: string;
  data?: {
    gameId?: string;
    bugId?: string;
    userId?: string;
    inviteId?: string;
    chatType?: string;
    messageId?: string;
    userChatId?: string;
  };
}

class PushNotificationService {
  private isInitialized = false;

  async initialize() {
    if (!Capacitor.isNativePlatform() || this.isInitialized) {
      return;
    }

    try {
      await this.requestPermissions();
      await this.registerListeners();
      await this.register();
      this.isInitialized = true;
      console.log('✅ Push notifications initialized');
    } catch (error) {
      console.error('❌ Failed to initialize push notifications:', error);
    }
  }

  private async requestPermissions() {
    const result = await PushNotifications.requestPermissions();
    
    if (result.receive === 'granted') {
      console.log('✅ Push notification permission granted');
      return true;
    } else {
      console.log('❌ Push notification permission denied');
      return false;
    }
  }

  private async register() {
    await PushNotifications.register();
  }

  private async registerListeners() {
    await PushNotifications.addListener('registration', async (token: Token) => {
      console.log('Push registration success, token:', token.value);
      await this.registerTokenWithBackend(token.value);
    });

    await PushNotifications.addListener('registrationError', (error: any) => {
      console.error('Error on registration:', error);
    });

    await PushNotifications.addListener(
      'pushNotificationReceived',
      (notification: PushNotificationSchema) => {
        console.log('Push notification received:', notification);
      }
    );

    await PushNotifications.addListener(
      'pushNotificationActionPerformed',
      async (action: ActionPerformed) => {
        console.log('Push notification action performed:', action);
        await this.handleNotificationAction(action);
      }
    );
  }

  private async registerTokenWithBackend(token: string) {
    try {
      const platform = Capacitor.getPlatform() === 'ios' ? 'IOS' : 'ANDROID';
      
      await api.post('/push/tokens', {
        token,
        platform,
        deviceId: await this.getDeviceId()
      });
      
      console.log('✅ Token registered with backend');
    } catch (error) {
      console.error('❌ Failed to register token with backend:', error);
    }
  }

  private async getDeviceId(): Promise<string | undefined> {
    try {
      return Capacitor.getPlatform();
    } catch {
      return undefined;
    }
  }

  private async handleNotificationAction(action: ActionPerformed) {
    const { actionId, notification } = action;
    const data = notification.data as NotificationData;

    if (!data || !data.type) {
      console.error('Invalid notification data');
      return;
    }

    if (actionId === 'tap') {
      await this.handleNotificationTap(data);
    } else if (actionId === 'accept') {
      await this.handleAcceptInvite(data);
    } else if (actionId === 'decline') {
      await this.handleDeclineInvite(data);
    }
  }

  private async handleNotificationTap(data: NotificationData) {
    const { type, data: payload } = data;

    switch (type) {
      case 'INVITE':
      case 'GAME_CHAT':
      case 'GAME_SYSTEM_MESSAGE':
      case 'GAME_REMINDER':
      case 'GAME_RESULTS':
        if (payload?.gameId) {
          this.navigateToGame(payload.gameId);
        }
        break;

      case 'BUG_CHAT':
        if (payload?.bugId) {
          this.navigateToBug(payload.bugId);
        }
        break;

      case 'USER_CHAT':
        if (payload?.userId) {
          this.navigateToUserChat(payload.userId);
        }
        break;

      default:
        console.log('Unknown notification type:', type);
    }
  }

  private async handleAcceptInvite(data: NotificationData) {
    if (!data.data?.inviteId) {
      console.error('No invite ID in notification data');
      return;
    }

    try {
      await invitesApi.accept(data.data.inviteId);
      console.log('✅ Invite accepted');
      
      if (data.data.gameId) {
        this.navigateToGame(data.data.gameId);
      }
    } catch (error) {
      console.error('❌ Failed to accept invite:', error);
    }
  }

  private async handleDeclineInvite(data: NotificationData) {
    if (!data.data?.inviteId) {
      console.error('No invite ID in notification data');
      return;
    }

    try {
      await invitesApi.decline(data.data.inviteId);
      console.log('✅ Invite declined');
    } catch (error) {
      console.error('❌ Failed to decline invite:', error);
    }
  }

  private navigateToGame(gameId: string) {
    window.location.href = `/games/${gameId}`;
  }

  private navigateToBug(_bugId: string) {
    window.location.href = `/bugs`;
  }

  private navigateToUserChat(_userId: string) {
    window.location.href = `/`;
  }

  async removeToken() {
    try {
      await PushNotifications.removeAllListeners();
      console.log('✅ Push notification listeners removed');
    } catch (error) {
      console.error('❌ Failed to remove push notification listeners:', error);
    }
  }
}

export default new PushNotificationService();
