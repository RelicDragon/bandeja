import prisma from '../../config/database';
import { ChatSyncEventType } from '@bandeja/chat-contract';
import { MessageState, ChatType, ChatContextType, Sport } from '@prisma/client';
import { SystemMessageType, createSystemMessageContent } from '../../utils/systemMessages';
import { computeContentSearchable } from '../../utils/messageSearchContent';
import { USER_SELECT_WITH_SPORT_PROFILES } from '../../utils/constants';
import { updateLastMessagePreview } from './lastMessagePreview.service';
import { ChatSyncEventService } from './chatSyncEvent.service';
import { getChatNotifier } from './chatNotifier';
import { projectMessageEmbeddedUsers } from '../user/projectEmbeddedBasicUsers';
import { resolveSport } from '../../sport/sportRegistry';

const SYSTEM_MESSAGE_INCLUDE = {
  sender: { select: USER_SELECT_WITH_SPORT_PROFILES },
  replyTo: {
    select: {
      id: true,
      content: true,
      sender: { select: USER_SELECT_WITH_SPORT_PROFILES },
    },
  },
  reactions: { include: { user: { select: USER_SELECT_WITH_SPORT_PROFILES } } },
  readReceipts: { include: { user: { select: USER_SELECT_WITH_SPORT_PROFILES } } },
} as const;

async function resolveSystemMessageSport(
  chatContextType: ChatContextType,
  contextId: string,
): Promise<Sport> {
  if (chatContextType === ChatContextType.GAME) {
    const game = await prisma.game.findUnique({
      where: { id: contextId },
      select: { sport: true },
    });
    return game?.sport ?? Sport.PADEL;
  }
  if (chatContextType === ChatContextType.USER) {
    const chat = await prisma.userChat.findUnique({
      where: { id: contextId },
      select: { user1: { select: { primarySport: true } } },
    });
    return resolveSport(chat?.user1?.primarySport ?? Sport.PADEL);
  }
  return Sport.PADEL;
}

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
    const sport = await resolveSystemMessageSport(chatContextType, contextId);
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
      const projected = projectMessageEmbeddedUsers(m, sport);
      const syncSeq = await ChatSyncEventService.appendEventInTransaction(
        tx,
        chatContextType,
        contextId,
        ChatSyncEventType.MESSAGE_CREATED,
        { message: projected }
      );
      await tx.chatMessage.update({
        where: { id: m.id },
        data: { serverSyncSeq: syncSeq },
      });
      const refreshed = await tx.chatMessage.findUnique({
        where: { id: m.id },
        include: SYSTEM_MESSAGE_INCLUDE,
      });
      const out = projectMessageEmbeddedUsers(refreshed ?? m, sport) as typeof m & {
        syncSeq?: number;
      };
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
    getChatNotifier().emitChatEvent(
      chatContextType,
      contextId,
      'message',
      { message },
      message.id,
      syncSeq,
      notifyUserIds
    );
    return message;
  }
}
