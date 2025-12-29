import prisma from '../config/database';
import { NotificationType, UnifiedNotificationRequest } from '../types/notifications.types';
import { ChatContextType, ChatType } from '@prisma/client';
import telegramNotificationService from './telegram/notification.service';
import pushNotificationService from './push/push-notification.service';
import { ChatMuteService } from './chat/chatMute.service';
import { createInvitePushNotification } from './push/notifications/invite-push.notification';
import { createGameChatPushNotification } from './push/notifications/game-chat-push.notification';
import { createUserChatPushNotification } from './push/notifications/user-chat-push.notification';
import { createBugChatPushNotification } from './push/notifications/bug-chat-push.notification';
import { createGameSystemMessagePushNotification } from './push/notifications/game-system-push.notification';
import { createGameReminderPushNotification } from './push/notifications/game-reminder-push.notification';
import { createGameResultsPushNotification } from './push/notifications/game-results-push.notification';
import { createLeagueRoundStartPushNotification } from './push/notifications/league-round-start-push.notification';

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

  async sendGameChatNotification(message: any, game: any, sender: any, _recipients: any[]) {
    const mentionIds = message.mentionIds || [];
    const hasMentions = mentionIds.length > 0;
    const chatType = message.chatType as ChatType;

    if (hasMentions) {
      const mentionedUserIds = new Set(mentionIds);
      
      const participants = await prisma.gameParticipant.findMany({
        where: { gameId: game.id },
        include: {
          user: {
            select: {
              id: true,
              language: true,
              currentCityId: true,
            }
          }
        }
      });

      for (const participant of participants) {
        const user = participant.user;
        if (user.id === sender.id) continue;
        if (!mentionedUserIds.has(user.id)) continue;

        let canSeeMessage = false;
        if (chatType === ChatType.PUBLIC) {
          canSeeMessage = true;
        } else if (chatType === ChatType.PRIVATE) {
          canSeeMessage = participant.isPlaying;
        } else if (chatType === ChatType.ADMINS) {
          canSeeMessage = participant.role === 'OWNER' || participant.role === 'ADMIN';
        }

        if (canSeeMessage) {
          const payload = await createGameChatPushNotification(message, game, sender, user);
          
          if (payload) {
            await this.sendNotification({
              userId: user.id,
              type: NotificationType.GAME_CHAT,
              payload
            });
          }
        }
      }
    } else {
      const participants = await prisma.gameParticipant.findMany({
        where: { gameId: game.id },
        include: {
          user: {
            select: {
              id: true,
              language: true,
              currentCityId: true,
            }
          }
        }
      });

      for (const participant of participants) {
        const user = participant.user;
        if (user.id === sender.id) continue;

        const isMuted = await ChatMuteService.isChatMuted(user.id, ChatContextType.GAME, game.id);
        if (isMuted) continue;

        let canSeeMessage = false;
        if (chatType === ChatType.PUBLIC) {
          canSeeMessage = true;
        } else if (chatType === ChatType.PRIVATE) {
          canSeeMessage = participant.isPlaying;
        } else if (chatType === ChatType.ADMINS) {
          canSeeMessage = participant.role === 'OWNER' || participant.role === 'ADMIN';
        }

        if (canSeeMessage) {
          const payload = await createGameChatPushNotification(message, game, sender, user);
          
          if (payload) {
            await this.sendNotification({
              userId: user.id,
              type: NotificationType.GAME_CHAT,
              payload
            });
          }
        }
      }
    }

    await telegramNotificationService.sendGameChatNotification(message, game, sender);
  }

  async sendUserChatNotification(message: any, userChat: any, sender: any) {
    const recipient = userChat.user1Id === sender.id ? userChat.user2 : userChat.user1;
    
    if (!recipient) return;
    
    const mentionIds = message.mentionIds || [];
    const hasMentions = mentionIds.length > 0;
    const isMentioned = hasMentions && mentionIds.includes(recipient.id);
    
    if (hasMentions && !isMentioned) {
      return;
    }
    
    if (!hasMentions) {
      const isMuted = await ChatMuteService.isChatMuted(recipient.id, ChatContextType.USER, userChat.id);
      if (isMuted) return;
    }
    
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

  async sendBugChatNotification(message: any, bug: any, sender: any, _recipients: any[]) {
    const mentionIds = message.mentionIds || [];
    const hasMentions = mentionIds.length > 0;

    if (hasMentions) {
      const bugCreator = await prisma.user.findUnique({
        where: { id: bug.senderId },
        select: {
          id: true,
        }
      });

      const bugParticipants = await prisma.bugParticipant.findMany({
        where: { bugId: bug.id },
        include: {
          user: {
            select: {
              id: true,
            }
          }
        }
      });

      const admins = await prisma.user.findMany({
        where: {
          isAdmin: true,
        },
        select: {
          id: true,
        }
      });

      const allPotentialRecipients = new Map<string, any>();
      
      if (bugCreator && bugCreator.id !== sender.id) {
        allPotentialRecipients.set(bugCreator.id, bugCreator);
      }

      for (const participant of bugParticipants) {
        if (participant.user.id !== sender.id) {
          allPotentialRecipients.set(participant.user.id, participant.user);
        }
      }

      for (const admin of admins) {
        if (admin.id !== sender.id && !allPotentialRecipients.has(admin.id)) {
          allPotentialRecipients.set(admin.id, admin);
        }
      }

      for (const userId of mentionIds) {
        if (userId === sender.id) continue;
        
        const recipient = allPotentialRecipients.get(userId);
        if (!recipient) continue;

        const payload = await createBugChatPushNotification(message, bug, sender, recipient);
        
        if (payload) {
          await this.sendNotification({
            userId: recipient.id,
            type: NotificationType.BUG_CHAT,
            payload
          });
        }
      }
    } else {
      const bugCreator = await prisma.user.findUnique({
        where: { id: bug.senderId },
        select: {
          id: true,
        }
      });

      const bugParticipants = await prisma.bugParticipant.findMany({
        where: { bugId: bug.id },
        include: {
          user: {
            select: {
              id: true,
            }
          }
        }
      });

      const admins = await prisma.user.findMany({
        where: {
          isAdmin: true,
        },
        select: {
          id: true,
        }
      });

      const allPotentialRecipients = new Map<string, any>();
      
      if (bugCreator && bugCreator.id !== sender.id) {
        allPotentialRecipients.set(bugCreator.id, bugCreator);
      }

      for (const participant of bugParticipants) {
        if (participant.user.id !== sender.id) {
          allPotentialRecipients.set(participant.user.id, participant.user);
        }
      }

      for (const admin of admins) {
        if (admin.id !== sender.id && !allPotentialRecipients.has(admin.id)) {
          allPotentialRecipients.set(admin.id, admin);
        }
      }

      for (const recipient of allPotentialRecipients.values()) {
        const isMuted = await ChatMuteService.isChatMuted(recipient.id, ChatContextType.BUG, bug.id);
        if (isMuted) continue;

        const payload = await createBugChatPushNotification(message, bug, sender, recipient);
        
        if (payload) {
          await this.sendNotification({
            userId: recipient.id,
            type: NotificationType.BUG_CHAT,
            payload
          });
        }
      }
    }

    await telegramNotificationService.sendBugChatNotification(message, bug, sender);
  }

  async sendGameSystemMessageNotification(message: any, game: any) {
    const chatType = message.chatType as ChatType;
    const participants = await prisma.gameParticipant.findMany({
      where: { gameId: game.id },
      include: {
        user: {
          select: {
            id: true,
            language: true,
            currentCityId: true,
          }
        }
      }
    });

    for (const participant of participants) {
      const user = participant.user;

      const isMuted = await ChatMuteService.isChatMuted(user.id, ChatContextType.GAME, game.id);
      if (isMuted) {
        continue;
      }

      let canSeeMessage = false;
      if (chatType === ChatType.PUBLIC) {
        canSeeMessage = true;
      } else if (chatType === ChatType.PRIVATE) {
        canSeeMessage = participant.isPlaying;
      } else if (chatType === ChatType.ADMINS) {
        canSeeMessage = participant.role === 'OWNER' || participant.role === 'ADMIN';
      }

      if (canSeeMessage) {
        const payload = await createGameSystemMessagePushNotification(message, game, user);
        
        if (payload) {
          await this.sendNotification({
            userId: user.id,
            type: NotificationType.GAME_SYSTEM_MESSAGE,
            payload
          });
        }
      }
    }

    await telegramNotificationService.sendGameSystemMessageNotification(message, game);
  }

  async sendGameReminderNotification(gameId: string, recipients: any[], hoursBeforeStart: number) {
    for (const recipient of recipients) {
      const payload = await createGameReminderPushNotification(gameId, recipient, hoursBeforeStart);
      
      if (payload) {
        await this.sendNotification({
          userId: recipient.id,
          type: NotificationType.GAME_REMINDER,
          payload
        });
      }
    }

    await telegramNotificationService.sendGameReminderNotification(gameId, hoursBeforeStart);
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

  async sendLeagueRoundStartNotification(game: any, user: any) {
    const payload = await createLeagueRoundStartPushNotification(game, user);
    
    if (payload) {
      await this.sendNotification({
        userId: user.id,
        type: NotificationType.GAME_REMINDER,
        payload
      });
    }

    await telegramNotificationService.sendLeagueRoundStartNotification(game, user);
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
