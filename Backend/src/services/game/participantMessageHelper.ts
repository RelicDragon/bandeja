import prisma from '../../config/database';
import { createSystemMessage } from '../../controllers/chat.controller';
import { SystemMessageType, getUserDisplayName } from '../../utils/systemMessages';
import { GameService } from './game.service';
import notificationService from '../notification.service';
import { BasicUser } from '../../types/user.types';

export class ParticipantMessageHelper {
  static async sendJoinMessage(gameId: string, userId: string, messageType = SystemMessageType.USER_JOINED_GAME) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    if (user) {
      const userName = getUserDisplayName(user.firstName, user.lastName);
      
      try {
        const systemMessage = await createSystemMessage(gameId, {
          type: messageType,
          variables: { userName }
        });

        if (systemMessage) {
          const game = await prisma.game.findUnique({
            where: { id: gameId },
            include: {
              court: {
                include: {
                  club: true
                }
              },
              club: true
            }
          });

          if (game) {
            notificationService.sendGameSystemMessageNotification(systemMessage, game).catch(error => {
              console.error('Failed to send notifications for join:', error);
            });
          }
        }

        return systemMessage;
      } catch (error) {
        console.error('Failed to create system message for game join:', error);
        return null;
      }
    }
    return null;
  }

  static async sendLeaveMessage(gameId: string, user: BasicUser, messageType: SystemMessageType) {
    if (user) {
      const userName = getUserDisplayName(user.firstName, user.lastName);
      
      try {
        const systemMessage = await createSystemMessage(gameId, {
          type: messageType,
          variables: { userName }
        });

        if (systemMessage) {
          const game = await prisma.game.findUnique({
            where: { id: gameId },
            include: {
              court: {
                include: {
                  club: true
                }
              },
              club: true
            }
          });

          if (game) {
            notificationService.sendGameSystemMessageNotification(systemMessage, game).catch(error => {
              console.error('Failed to send notifications for leave:', error);
            });
          }
        }

        return systemMessage;
      } catch (error) {
        console.error('Failed to create system message for game leave:', error);
        return null;
      }
    }
    return null;
  }

  static async emitGameUpdate(gameId: string, senderId: string) {
    try {
      const socketService = (global as any).socketService;
      if (socketService) {
        const game = await GameService.getGameById(gameId, senderId);
        if (game) {
          await socketService.emitGameUpdate(gameId, senderId, game);
        }
      }
    } catch (error) {
      console.error('Failed to emit game update:', error);
    }
  }

  static async emitGameUpdateToUser(gameId: string, userId: string) {
    try {
      const socketService = (global as any).socketService;
      if (socketService) {
        const game = await GameService.getGameById(gameId, userId);
        if (game) {
          await socketService.emitGameUpdate(gameId, userId, game);
        }
      }
    } catch (error) {
      console.error('Failed to emit game update to user:', error);
    }
  }
}

