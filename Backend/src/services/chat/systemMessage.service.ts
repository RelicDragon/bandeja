import prisma from '../../config/database';
import { MessageState, ChatType, ChatContextType, ChatSyncEventType } from '@prisma/client';
import { SystemMessageType, createSystemMessageContent } from '../../utils/systemMessages';
import { computeContentSearchable } from '../../utils/messageSearchContent';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { updateLastMessagePreview } from './lastMessagePreview.service';
import { ChatSyncEventService } from './chatSyncEvent.service';

const SYSTEM_MESSAGE_INCLUDE = {
  sender: { select: USER_SELECT_FIELDS },
  replyTo: {
    select: {
      id: true,
      content: true,
      sender: { select: USER_SELECT_FIELDS },
    },
  },
  reactions: { include: { user: { select: USER_SELECT_FIELDS } } },
  readReceipts: { include: { user: { select: USER_SELECT_FIELDS } } },
} as const;

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
    const message = await prisma.$transaction(async (tx) => {
      const m = await tx.chatMessage.create({
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
        include: SYSTEM_MESSAGE_INCLUDE
      });
      const syncSeq = await ChatSyncEventService.appendEventInTransaction(
        tx,
        chatContextType,
        contextId,
        ChatSyncEventType.MESSAGE_CREATED,
        { message: m }
      );
      await tx.chatMessage.update({
        where: { id: m.id },
        data: { serverSyncSeq: syncSeq },
      });
      const refreshed = await tx.chatMessage.findUnique({
        where: { id: m.id },
        include: SYSTEM_MESSAGE_INCLUDE,
      });
      const out = (refreshed ?? m) as typeof m & { syncSeq?: number };
      out.syncSeq = syncSeq;
      return out;
    });

    await updateLastMessagePreview(chatContextType, contextId);

    return message;
  }

  static async createSystemMessageWithEmit(
    contextId: string,
    messageData: { type: SystemMessageType; variables: Record<string, string> },
    chatType: ChatType = ChatType.PUBLIC,
    chatContextType: ChatContextType = ChatContextType.GAME
  ) {
    const message = await SystemMessageService.createSystemMessage(
      contextId,
      messageData,
      chatType,
      chatContextType
    );
    const socketService = (global as {
      socketService?: {
        emitChatEvent: (
          ct: ChatContextType,
          cid: string,
          ev: string,
          data: unknown,
          mid?: string,
          seq?: number,
          notifyUserIds?: string[]
        ) => void;
      };
    }).socketService;
    if (socketService) {
      const syncSeq = (message as { syncSeq?: number }).syncSeq;
      let notifyUserIds: string[] | undefined;
      if (chatContextType === ChatContextType.USER) {
        const peers = await prisma.userChat.findUnique({
          where: { id: contextId },
          select: { user1Id: true, user2Id: true },
        });
        if (peers) {
          notifyUserIds = [peers.user1Id, peers.user2Id].filter((id): id is string => typeof id === 'string' && id.length > 0);
        }
      }
      socketService.emitChatEvent(
        chatContextType,
        contextId,
        'message',
        { message },
        message.id,
        syncSeq,
        notifyUserIds
      );
    }
    return message;
  }
}
