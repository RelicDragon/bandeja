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
import { createGroupChatPushNotification } from './push/notifications/group-chat-push.notification';
import { createGameSystemMessagePushNotification } from './push/notifications/game-system-push.notification';
import { createGameReminderPushNotification } from './push/notifications/game-reminder-push.notification';
import { createGameResultsPushNotification } from './push/notifications/game-results-push.notification';
import { createLeagueRoundStartPushNotification } from './push/notifications/league-round-start-push.notification';
import { createNewGamePushNotification } from './push/notifications/new-game-push.notification';
import { createBetResolvedPushNotification, createBetNeedsReviewPushNotification } from './push/notifications/bet-resolved-push.notification';

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
        console.log(`[NotificationService] Sending push notification to user ${userId}, type: ${type}`);
        const sent = await pushNotificationService.sendNotificationToUser(userId, payload);
        results.push = sent > 0;
        console.log(`[NotificationService] Push notification result: ${sent} device(s) notified`);
      } catch (error) {
        console.error('[NotificationService] ❌ Failed to send push notification:', error);
        console.error('[NotificationService] Error details:', {
          userId,
          type,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
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

    const currentGameParticipants = await prisma.gameParticipant.findMany({
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

    const currentGameUserIds = new Set(currentGameParticipants.map(p => p.user.id));

    if (hasMentions) {
      const mentionedUserIds = new Set(mentionIds);

      for (const participant of currentGameParticipants) {
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
      for (const participant of currentGameParticipants) {
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

    const gameWithParent = await prisma.game.findUnique({
      where: { id: game.id },
      select: { parentId: true }
    });

    if (gameWithParent?.parentId) {
      const parentGameAdmins = await prisma.gameParticipant.findMany({
        where: {
          gameId: gameWithParent.parentId,
          role: { in: ['OWNER', 'ADMIN'] }
        },
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

      const mentionedUserIds = hasMentions ? new Set(mentionIds) : null;

      for (const parentParticipant of parentGameAdmins) {
        const user = parentParticipant.user;
        if (user.id === sender.id) continue;
        if (currentGameUserIds.has(user.id)) continue;

        if (hasMentions) {
          if (!mentionedUserIds?.has(user.id)) continue;
        } else {
          const isMuted = await ChatMuteService.isChatMuted(user.id, ChatContextType.GAME, game.id);
          if (isMuted) continue;
        }

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

  async sendGroupChatNotification(message: any, groupChannel: any, sender: any, _recipients: any[]) {
    const mentionIds = message.mentionIds || [];
    const hasMentions = mentionIds.length > 0;

    const participants = await prisma.groupChannelParticipant.findMany({
      where: { groupChannelId: groupChannel.id },
      include: {
        user: {
          select: {
            id: true,
            language: true,
          }
        }
      }
    });

    if (hasMentions) {
      const mentionedUserIds = new Set(mentionIds);

      for (const participant of participants) {
        const user = participant.user;
        if (user.id === sender.id) continue;
        if (!mentionedUserIds.has(user.id)) continue;

        const payload = await createGroupChatPushNotification(message, groupChannel, sender, user);
        
        if (payload) {
          await this.sendNotification({
            userId: user.id,
            type: NotificationType.GROUP_CHAT,
            payload
          });
        }
      }
    } else {
      for (const participant of participants) {
        const user = participant.user;
        if (user.id === sender.id) continue;

        const isMuted = await ChatMuteService.isChatMuted(user.id, ChatContextType.GROUP, groupChannel.id);
        if (isMuted) continue;

        const payload = await createGroupChatPushNotification(message, groupChannel, sender, user);
        
        if (payload) {
          await this.sendNotification({
            userId: user.id,
            type: NotificationType.GROUP_CHAT,
            payload
          });
        }
      }
    }

    await telegramNotificationService.sendGroupChatNotification(message, groupChannel, sender);
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

  async sendBetResolvedNotification(betId: string, userId: string, isWinner: boolean, totalCoinsWon?: number) {
    try {
      const payload = await createBetResolvedPushNotification(betId, userId, isWinner, totalCoinsWon);
      if (payload) {
        await this.sendNotification({
          userId,
          type: NotificationType.GAME_SYSTEM_MESSAGE,
          payload
        });
      }

      await telegramNotificationService.sendBetResolvedNotification(betId, userId, isWinner, totalCoinsWon);
    } catch (error) {
      console.error(`Failed to send bet resolved notification to user ${userId}:`, error);
    }
  }

  async sendBetNeedsReviewNotification(betId: string, userId: string) {
    try {
      const payload = await createBetNeedsReviewPushNotification(betId, userId);
      if (payload) {
        await this.sendNotification({
          userId,
          type: NotificationType.GAME_SYSTEM_MESSAGE,
          payload
        });
      }

      await telegramNotificationService.sendBetNeedsReviewNotification(betId, userId);
    } catch (error) {
      console.error(`Failed to send bet needs review notification to user ${userId}:`, error);
    }
  }

  async sendNewGameNotification(game: any, cityId: string, creatorId: string) {
    if (!game.isPublic || game.entityType === 'LEAGUE' || game.entityType === 'LEAGUE_SEASON') {
      return;
    }

    if (!game.clubId) {
      return;
    }

    const { GameSubscriptionService } = await import('./gameSubscription.service');

    const usersWithSubscriptions = await prisma.user.findMany({
      where: {
        currentCityId: cityId,
        id: { not: creatorId },
        gameSubscriptions: {
          some: {
            isActive: true,
            cityId: cityId,
          },
        },
        OR: [
          { sendPushMessages: true },
          { sendTelegramMessages: true }
        ]
      },
      select: {
        id: true,
        telegramId: true,
        sendTelegramMessages: true,
        sendPushMessages: true,
        language: true,
        currentCityId: true,
      }
    });

    for (const recipient of usersWithSubscriptions) {
      const matchesSubscription = await GameSubscriptionService.checkGameMatchesSubscriptions(
        game,
        recipient.id
      );

      if (!matchesSubscription) {
        continue;
      }

      const shouldSendTelegram = recipient.telegramId && recipient.sendTelegramMessages;
      const shouldSendPush = recipient.sendPushMessages;

      if (shouldSendPush) {
        try {
          const payload = await createNewGamePushNotification(game, recipient);
          if (payload) {
            await this.sendNotification({
              userId: recipient.id,
              type: NotificationType.NEW_GAME,
              payload
            });
          }
        } catch (error) {
          console.error(`Failed to send push notification for new game to user ${recipient.id}:`, error);
        }
      }

      if (shouldSendTelegram) {
        try {
          await telegramNotificationService.sendNewGameNotification(game, recipient);
        } catch (error) {
          console.error(`Failed to send telegram notification for new game to user ${recipient.id}:`, error);
        }
      }
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
      case NotificationType.GROUP_CHAT:
      case NotificationType.GAME_SYSTEM_MESSAGE:
      case NotificationType.GAME_RESULTS:
      case NotificationType.NEW_GAME:
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
      case NotificationType.GROUP_CHAT:
      case NotificationType.GAME_SYSTEM_MESSAGE:
      case NotificationType.GAME_RESULTS:
      case NotificationType.NEW_GAME:
        return user.sendPushMessages;
      default:
        return false;
    }
  }
}

export default new NotificationService();
