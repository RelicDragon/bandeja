import prisma from '../config/database';
import { NotificationType, UnifiedNotificationRequest } from '../types/notifications.types';
import { ChatContextType, ChatType, NotificationChannelType } from '@prisma/client';
import telegramNotificationService from './telegram/notification.service';
import { NotificationPreferenceService, NOTIFICATION_TYPE_TO_PREF } from './notificationPreference.service';
import { PreferenceKey } from '../types/notifications.types';
import pushNotificationService from './push/push-notification.service';
import { ChatMuteService } from './chat/chatMute.service';
import { canParticipantSeeGameChatMessage } from './chat/gameChatVisibility';
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
import { createBetResolvedPushNotification, createBetNeedsReviewPushNotification, createBetCancelledPushNotification } from './push/notifications/bet-resolved-push.notification';
import { createTransactionPushNotification } from './push/notifications/transaction-push.notification';
import { createNewMarketItemPushNotification } from './push/notifications/new-market-item-push.notification';

class NotificationService {
  async sendNotification(request: UnifiedNotificationRequest) {
    const { userId, type, payload, preferTelegram = false, preferPush = false } = request;

    const prefKey = NOTIFICATION_TYPE_TO_PREF[type];
    const [shouldSendTelegram, shouldSendPush] = await Promise.all([
      preferTelegram || NotificationPreferenceService.doesUserAllow(userId, NotificationChannelType.TELEGRAM, prefKey),
      preferPush || NotificationPreferenceService.doesUserAllow(userId, NotificationChannelType.PUSH, prefKey),
    ]);

    const results = {
      telegram: false,
      push: false
    };

    if (shouldSendTelegram) {
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

        const canSeeMessage = canParticipantSeeGameChatMessage(participant, game, chatType);

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

        const canSeeMessage = canParticipantSeeGameChatMessage(participant, game, chatType);

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

    if (gameWithParent?.parentId && chatType !== ChatType.PRIVATE) {
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

      const canSeeMessage = canParticipantSeeGameChatMessage(participant, game, chatType);

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

  async sendBetCancelledNotification(betId: string, userId: string) {
    try {
      const payload = await createBetCancelledPushNotification(betId, userId);
      if (payload) {
        await this.sendNotification({
          userId,
          type: NotificationType.GAME_SYSTEM_MESSAGE,
          payload
        });
      }
      await telegramNotificationService.sendBetCancelledNotification(betId, userId);
    } catch (error) {
      console.error(`Failed to send bet cancelled notification to user ${userId}:`, error);
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
          { notificationPreferences: { some: { channelType: NotificationChannelType.PUSH, sendMessages: true } } },
          { notificationPreferences: { some: { channelType: NotificationChannelType.TELEGRAM, sendMessages: true } } },
          { AND: [{ telegramId: { not: null } }, { sendTelegramMessages: true }] },
          { AND: [{ pushTokens: { some: {} } }, { sendPushMessages: true }] },
        ],
      },
      select: {
        id: true,
        telegramId: true,
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

      const [allowPush, allowTelegram] = await Promise.all([
        NotificationPreferenceService.doesUserAllow(recipient.id, NotificationChannelType.PUSH, PreferenceKey.SEND_MESSAGES),
        NotificationPreferenceService.doesUserAllow(recipient.id, NotificationChannelType.TELEGRAM, PreferenceKey.SEND_MESSAGES),
      ]);

      if (allowPush) {
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

      if (allowTelegram) {
        try {
          await telegramNotificationService.sendNewGameNotification(game, recipient);
        } catch (error) {
          console.error(`Failed to send telegram notification for new game to user ${recipient.id}:`, error);
        }
      }
    }
  }

  async sendTransactionNotification(transactionId: string, userId: string, isSender: boolean) {
    try {
      const payload = await createTransactionPushNotification(transactionId, userId, isSender);
      if (payload) {
        await this.sendNotification({
          userId,
          type: NotificationType.TRANSACTION,
          payload
        });
      }

      await telegramNotificationService.sendTransactionNotification(transactionId, userId, isSender);
    } catch (error) {
      console.error(`Failed to send transaction notification to user ${userId}:`, error);
    }
  }

  async sendNewMarketItemNotification(
    marketItem: { id: string; title: string; priceCents: number | null; currency: string; cityId: string },
    sellerUserId: string
  ) {
    try {
      const city = await prisma.city.findUnique({
        where: { id: marketItem.cityId },
        select: { id: true, name: true },
      });
      if (!city) return;

      const recipients = await prisma.user.findMany({
        where: {
          currentCityId: marketItem.cityId,
          id: { not: sellerUserId },
          OR: [
            { notificationPreferences: { some: { channelType: NotificationChannelType.PUSH, sendMarketplaceNotifications: true } } },
            { notificationPreferences: { some: { channelType: NotificationChannelType.TELEGRAM, sendMarketplaceNotifications: true } } },
            { AND: [{ telegramId: { not: null } }] },
            { AND: [{ pushTokens: { some: {} } }] },
          ],
        },
        select: {
          id: true,
          telegramId: true,
          language: true,
        },
      });

      for (const recipient of recipients) {
        const lang = recipient.language || 'en';

        const [allowPush, allowTelegram] = await Promise.all([
          NotificationPreferenceService.doesUserAllow(recipient.id, NotificationChannelType.PUSH, PreferenceKey.SEND_MARKETPLACE_NOTIFICATIONS),
          NotificationPreferenceService.doesUserAllow(recipient.id, NotificationChannelType.TELEGRAM, PreferenceKey.SEND_MARKETPLACE_NOTIFICATIONS),
        ]);

        if (allowPush) {
          try {
            const payload = createNewMarketItemPushNotification(marketItem, city.name, lang);
            await this.sendNotification({
              userId: recipient.id,
              type: NotificationType.NEW_MARKET_ITEM,
              payload,
            });
          } catch (error) {
            console.error(`Failed to send push notification for new market item to user ${recipient.id}:`, error);
          }
        }

        if (allowTelegram && recipient.telegramId) {
          try {
            await telegramNotificationService.sendNewMarketItemNotification(
              marketItem,
              city.name,
              { id: recipient.id, telegramId: recipient.telegramId, language: recipient.language }
            );
          } catch (error) {
            console.error(`Failed to send telegram notification for new market item to user ${recipient.id}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('[NotificationService] Failed to send new market item notifications:', error);
    }
  }

}

export default new NotificationService();
