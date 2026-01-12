import { createSystemMessage } from '../controllers/chat.controller';
import { SystemMessageType, getUserDisplayName } from './systemMessages';
import notificationService from '../services/notification.service';
import { fetchGameWithDetails } from './gameQueries';
import { USER_SELECT_FIELDS } from './constants';
import prisma from '../config/database';
import { ChatType } from '@prisma/client';

export async function createSystemMessageWithNotification(
  gameId: string,
  messageType: SystemMessageType,
  userId: string,
  chatType?: ChatType
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT_FIELDS,
    });

    if (!user) {
      return;
    }

    const userName = getUserDisplayName(user.firstName, user.lastName);
    const systemMessage = await createSystemMessage(
      gameId,
      {
        type: messageType,
        variables: { userName },
      },
      chatType
    );

    if (systemMessage) {
      const game = await fetchGameWithDetails(gameId);
      if (game) {
        notificationService.sendGameSystemMessageNotification(systemMessage, game).catch(error => {
          console.error(`Failed to send notifications for ${messageType}:`, error);
        });
      }
    }
  } catch (error) {
    console.error(`Failed to create system message ${messageType}:`, error);
  }
}
