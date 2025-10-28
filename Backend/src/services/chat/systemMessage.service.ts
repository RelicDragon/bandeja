import prisma from '../../config/database';
import { MessageState, ChatType } from '@prisma/client';
import { SystemMessageType, createSystemMessageContent } from '../../utils/systemMessages';

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
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            level: true,
            gender: true,
          }
        },
        replyTo: {
          select: {
            id: true,
            content: true,
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                level: true,
                gender: true
              }
            }
          }
        },
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                level: true,
                gender: true
              }
            }
          }
        },
        readReceipts: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                level: true,
                gender: true
              }
            }
          }
        }
      }
    });

    return message;
  }
}
