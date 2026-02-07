import prisma from '../../config/database';
import { MessageState, ChatType, ChatContextType } from '@prisma/client';
import { SystemMessageType, createSystemMessageContent } from '../../utils/systemMessages';
import { computeContentSearchable } from '../../utils/messageSearchContent';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { updateLastMessagePreview } from './lastMessagePreview.service';

export class SystemMessageService {
  static async createSystemMessage(
    contextId: string, 
    messageData: { type: SystemMessageType; variables: Record<string, string> }, 
    chatType: ChatType = ChatType.PUBLIC,
    chatContextType: ChatContextType = ChatContextType.GAME
  ) {
    const text = createSystemMessageContent(messageData);
    const content = JSON.stringify({
      type: messageData.type,
      variables: messageData.variables,
      text
    });
    const message = await prisma.chatMessage.create({
      data: {
        chatContextType,
        contextId,
        gameId: chatContextType === 'GAME' ? contextId : null,
        senderId: null,
        content: content ?? '',
        contentSearchable: computeContentSearchable(text),
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

    await updateLastMessagePreview(chatContextType, contextId);
    return message;
  }
}
