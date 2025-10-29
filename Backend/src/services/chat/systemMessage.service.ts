import prisma from '../../config/database';
import { MessageState, ChatType } from '@prisma/client';
import { SystemMessageType, createSystemMessageContent } from '../../utils/systemMessages';
import { USER_SELECT_FIELDS } from '../../utils/constants';

export class SystemMessageService {
  static async createSystemMessage(
    gameId: string, 
    messageData: { type: SystemMessageType; variables: Record<string, string> }, 
    chatType: ChatType = ChatType.PUBLIC
  ) {
    const content = JSON.stringify({
      type: messageData.type,
      variables: messageData.variables,
      text: createSystemMessageContent(messageData)
    });
    
    const message = await prisma.chatMessage.create({
      data: {
        gameId,
        senderId: null,
        content,
        mediaUrls: [],
        thumbnailUrls: [],
        chatType,
        state: MessageState.SENT
      },
      include: {
        sender: {
          select: USER_SELECT_FIELDS,
        },
        replyTo: {
          select: {
            id: true,
            content: true,
            sender: {
              select: USER_SELECT_FIELDS
            }
          }
        },
        reactions: {
          include: {
            user: {
              select: USER_SELECT_FIELDS
            }
          }
        },
        readReceipts: {
          include: {
            user: {
              select: USER_SELECT_FIELDS
            }
          }
        }
      }
    });

    return message;
  }
}
