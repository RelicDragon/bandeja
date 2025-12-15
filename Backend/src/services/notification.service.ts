import prisma from '../config/database';
import { NotificationType, UnifiedNotificationRequest } from '../types/notifications.types';
import telegramNotificationService from './telegram/notification.service';
import pushNotificationService from './push/push-notification.service';
import { createInvitePushNotification } from './push/notifications/invite-push.notification';
import { createGameChatPushNotification } from './push/notifications/game-chat-push.notification';
import { createUserChatPushNotification } from './push/notifications/user-chat-push.notification';
import { createBugChatPushNotification } from './push/notifications/bug-chat-push.notification';
import { createGameSystemMessagePushNotification } from './push/notifications/game-system-push.notification';
import { createGameReminderPushNotification } from './push/notifications/game-reminder-push.notification';
import { createGameResultsPushNotification } from './push/notifications/game-results-push.notification';

class NotificationService {
  async sendNotification(request: UnifiedNotificationRequest) {
    const { userId, type, payload, preferTelegram = false, preferPush = false } = request;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        telegramId: true,
        sendTelegramMessages: true,
        sendTelegramInvites: true,
        sendTelegramDirectMessages: true,
        sendTelegramReminders: true,
        sendPushMessages: true,
        sendPushInvites: true,
        sendPushDirectMessages: true,
        sendPushReminders: true,
      }
    });

    if (!user) {
      console.error(`User ${userId} not found`);
      return;
    }

    const shouldSendTelegram = this.shouldSendViaTelegram(user, type, preferTelegram);
    const shouldSendPush = this.shouldSendViaPush(user, type, preferPush);

    const results = {
      telegram: false,
      push: false
    };

    if (shouldSendTelegram && user.telegramId) {
    }

    if (shouldSendPush) {
      try {
        const sent = await pushNotificationService.sendNotificationToUser(userId, payload);
        results.push = sent > 0;
      } catch (error) {
        console.error('Failed to send push notification:', error);
      }
    }

    return results;
  }

  async sendInviteNotification(invite: any) {
    const receiverId = invite.receiverId;
    const payload = await createInvitePushNotification(invite);
    
    if (payload) {
      await this.sendNotification({
        userId: receiverId,
        type: NotificationType.INVITE,
        payload
      });
    }

    await telegramNotificationService.sendInviteNotification(invite);
  }

  async sendGameChatNotification(message: any, game: any, sender: any, recipients: any[]) {
    for (const recipient of recipients) {
      const payload = await createGameChatPushNotification(message, game, sender, recipient);
      
      if (payload) {
        await this.sendNotification({
          userId: recipient.id,
          type: NotificationType.GAME_CHAT,
          payload
        });
      }
    }

    await telegramNotificationService.sendGameChatNotification(message, game, sender);
  }

  async sendUserChatNotification(message: any, userChat: any, sender: any) {
    const recipient = userChat.user1Id === sender.id ? userChat.user2 : userChat.user1;
    
    const payload = await createUserChatPushNotification(message, userChat, sender, recipient);
    
    if (payload) {
      await this.sendNotification({
        userId: recipient.id,
        type: NotificationType.USER_CHAT,
        payload
      });
    }

    await telegramNotificationService.sendUserChatNotification(message, userChat, sender);
  }

  async sendBugChatNotification(message: any, bug: any, sender: any, recipients: any[]) {
    for (const recipient of recipients) {
      const payload = await createBugChatPushNotification(message, bug, sender, recipient);
      
      if (payload) {
        await this.sendNotification({
          userId: recipient.id,
          type: NotificationType.BUG_CHAT,
          payload
        });
      }
    }

    await telegramNotificationService.sendBugChatNotification(message, bug, sender);
  }

  async sendGameSystemMessageNotification(message: any, game: any, recipients: any[]) {
    for (const recipient of recipients) {
      const payload = await createGameSystemMessagePushNotification(message, game, recipient);
      
      if (payload) {
        await this.sendNotification({
          userId: recipient.id,
          type: NotificationType.GAME_SYSTEM_MESSAGE,
          payload
        });
      }
    }

    await telegramNotificationService.sendGameSystemMessageNotification(message, game);
  }

  async sendGameReminderNotification(gameId: string, recipients: any[]) {
    for (const recipient of recipients) {
      const payload = await createGameReminderPushNotification(gameId, recipient);
      
      if (payload) {
        await this.sendNotification({
          userId: recipient.id,
          type: NotificationType.GAME_REMINDER,
          payload
        });
      }
    }
  }

  async sendGameResultsNotification(gameId: string, userId: string, isEdited: boolean = false) {
    const payload = await createGameResultsPushNotification(gameId, userId, isEdited);
    
    if (payload) {
      await this.sendNotification({
        userId,
        type: NotificationType.GAME_RESULTS,
        payload
      });
    }
  }

  private shouldSendViaTelegram(user: any, type: NotificationType, preferTelegram: boolean): boolean {
    if (preferTelegram) return true;

    switch (type) {
      case NotificationType.INVITE:
        return user.sendTelegramInvites;
      case NotificationType.USER_CHAT:
        return user.sendTelegramDirectMessages;
      case NotificationType.GAME_REMINDER:
        return user.sendTelegramReminders;
      case NotificationType.GAME_CHAT:
      case NotificationType.BUG_CHAT:
      case NotificationType.GAME_SYSTEM_MESSAGE:
      case NotificationType.GAME_RESULTS:
        return user.sendTelegramMessages;
      default:
        return false;
    }
  }

  private shouldSendViaPush(user: any, type: NotificationType, preferPush: boolean): boolean {
    if (preferPush) return true;

    switch (type) {
      case NotificationType.INVITE:
        return user.sendPushInvites;
      case NotificationType.USER_CHAT:
        return user.sendPushDirectMessages;
      case NotificationType.GAME_REMINDER:
        return user.sendPushReminders;
      case NotificationType.GAME_CHAT:
      case NotificationType.BUG_CHAT:
      case NotificationType.GAME_SYSTEM_MESSAGE:
      case NotificationType.GAME_RESULTS:
        return user.sendPushMessages;
      default:
        return false;
    }
  }
}

export default new NotificationService();
