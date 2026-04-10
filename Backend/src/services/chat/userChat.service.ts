import prisma from '../../config/database';
import { ChatContextType, ChatSyncEventType } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { SystemMessageType, createSystemMessageContent, getUserDisplayName } from '../../utils/systemMessages';
import { computeContentSearchable } from '../../utils/messageSearchContent';
import { SystemMessageService } from './systemMessage.service';
import { updateLastMessagePreview } from './lastMessagePreview.service';
import { ChatMuteService } from './chatMute.service';
import { ChatSyncEventService } from './chatSyncEvent.service';
import { chatSyncMessageUpdatedCompactPayload } from '../../utils/chatSyncMessageUpdatePayload';

export class UserChatService {
  static async getUserChats(userId: string) {
    const chats = await prisma.userChat.findMany({
      where: {
        OR: [
          { user1Id: userId },
          { user2Id: userId }
        ]
      },
      include: {
        user1: {
          select: { ...USER_SELECT_FIELDS, allowMessagesFromNonContacts: true }
        },
        user2: {
          select: { ...USER_SELECT_FIELDS, allowMessagesFromNonContacts: true }
        },
        pinnedByUsers: {
          where: {
            userId
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    const rows = chats.map((chat) => ({
      ...chat,
      lastMessage: chat.lastMessagePreview
        ? { preview: chat.lastMessagePreview, updatedAt: chat.updatedAt }
        : null,
      isPinned: chat.pinnedByUsers.length > 0,
      pinnedAt: chat.pinnedByUsers[0]?.pinnedAt?.toISOString() ?? null
    }));
    const muted = await ChatMuteService.getMutedContextIdSet(
      userId,
      ChatContextType.USER,
      rows.map((r) => r.id)
    );
    return rows.map((r) => ({ ...r, isMuted: muted.has(r.id) }));
  }

  static async getOrCreateChatWithUser(currentUserId: string, otherUserId: string) {
    if (currentUserId === otherUserId) {
      throw new ApiError(400, 'Cannot create chat with yourself');
    }

    // Ensure consistent ordering (smaller ID first)
    const [id1, id2] = [currentUserId, otherUserId].sort();
    
    let userChat = await prisma.userChat.findUnique({
      where: {
        user1Id_user2Id: {
          user1Id: id1,
          user2Id: id2
        }
      },
      include: {
        user1: { select: { ...USER_SELECT_FIELDS, allowMessagesFromNonContacts: true } },
        user2: { select: { ...USER_SELECT_FIELDS, allowMessagesFromNonContacts: true } }
      }
    });

    if (!userChat) {
      const [user1, user2] = await Promise.all([
        prisma.user.findUnique({ where: { id: id1 }, select: { allowMessagesFromNonContacts: true } }),
        prisma.user.findUnique({ where: { id: id2 }, select: { allowMessagesFromNonContacts: true } })
      ]);
      userChat = await prisma.userChat.create({
        data: {
          user1Id: id1,
          user2Id: id2,
          user1allowed: user1?.allowMessagesFromNonContacts ?? true,
          user2allowed: user2?.allowMessagesFromNonContacts ?? true
        },
        include: {
          user1: { select: { ...USER_SELECT_FIELDS, allowMessagesFromNonContacts: true } },
          user2: { select: { ...USER_SELECT_FIELDS, allowMessagesFromNonContacts: true } }
        }
      });
    }

    const isMuted = await ChatMuteService.isChatMuted(
      currentUserId,
      ChatContextType.USER,
      userChat.id
    );
    return { ...userChat, isMuted };
  }

  static async getChatById(chatId: string, userId: string) {
    const chat = await prisma.userChat.findUnique({
      where: { id: chatId },
      include: {
        user1: { select: { ...USER_SELECT_FIELDS, allowMessagesFromNonContacts: true } },
        user2: { select: { ...USER_SELECT_FIELDS, allowMessagesFromNonContacts: true } }
      }
    });

    if (!chat) {
      throw new ApiError(404, 'Chat not found');
    }

    if (chat.user1Id !== userId && chat.user2Id !== userId) {
      throw new ApiError(403, 'Access denied');
    }

    return chat;
  }

  static async updateChatTimestamp(chatId: string) {
    await prisma.userChat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() }
    });
  }

  static readonly MAX_PINNED_CHATS = 5;

  static async pinUserChat(userId: string, chatId: string) {
    await this.getChatById(chatId, userId);

    return prisma.$transaction(async (tx) => {
      const existing = await tx.pinnedUserChat.findUnique({
        where: { userId_userChatId: { userId, userChatId: chatId } }
      });
      if (!existing) {
        const [pinnedUserCount, pinnedGroupCount] = await Promise.all([
          tx.pinnedUserChat.count({ where: { userId } }),
          tx.pinnedGroupChannel.count({ where: { userId, groupChannel: { isCityGroup: false } } })
        ]);
        if (pinnedUserCount + pinnedGroupCount >= this.MAX_PINNED_CHATS) {
          throw new ApiError(400, 'MAX_PINNED_CHATS');
        }
      }
      return tx.pinnedUserChat.upsert({
        where: {
          userId_userChatId: { userId, userChatId: chatId }
        },
        update: { pinnedAt: new Date() },
        create: { userId, userChatId: chatId }
      });
    });
  }

  static async unpinUserChat(userId: string, chatId: string) {
    await this.getChatById(chatId, userId);

    await prisma.pinnedUserChat.delete({
      where: {
        userId_userChatId: {
          userId,
          userChatId: chatId
        }
      }
    }).catch(() => {
      // Ignore if not pinned
    });

    return { success: true };
  }

  static async requestToChat(chatId: string, requesterId: string) {
    const chat = await this.getChatById(chatId, requesterId);
    const isUser1 = chat.user1Id === requesterId;
    const isUser2 = chat.user2Id === requesterId;
    if (isUser1 && chat.user2allowed) throw new ApiError(400, 'Chat is already allowed');
    if (isUser2 && chat.user1allowed) throw new ApiError(400, 'Chat is already allowed');
    if (!isUser1 && !isUser2) throw new ApiError(403, 'Access denied');
    const count = await prisma.chatMessage.count({
      where: {
        chatContextType: ChatContextType.USER,
        contextId: chatId,
        deletedAt: null,
      }
    });
    if (count > 0) {
      return null;
    }
    const requester = isUser1 ? chat.user1 : chat.user2;
    const content = JSON.stringify({
      type: SystemMessageType.USER_CHAT_REQUEST,
      variables: { requesterName: getUserDisplayName(requester.firstName, requester.lastName) },
      text: createSystemMessageContent({
        type: SystemMessageType.USER_CHAT_REQUEST,
        variables: { requesterName: getUserDisplayName(requester.firstName, requester.lastName) }
      }),
      requesterId,
      responded: false
    });
    const message = await prisma.$transaction(async (tx) => {
      const m = await tx.chatMessage.create({
        data: {
          chatContextType: ChatContextType.USER,
          contextId: chatId,
          senderId: null,
          content,
          contentSearchable: computeContentSearchable(content),
          mediaUrls: [],
          thumbnailUrls: [],
          chatType: 'PUBLIC',
          state: 'SENT'
        },
        include: {
          sender: { select: USER_SELECT_FIELDS },
          replyTo: { select: { id: true, content: true, sender: { select: USER_SELECT_FIELDS } } },
          reactions: { include: { user: { select: USER_SELECT_FIELDS } } },
          readReceipts: { include: { user: { select: USER_SELECT_FIELDS } } }
        }
      });
      const syncSeq = await ChatSyncEventService.appendEventInTransaction(
        tx,
        ChatContextType.USER,
        chatId,
        ChatSyncEventType.MESSAGE_CREATED,
        { message: m }
      );
      await tx.chatMessage.update({
        where: { id: m.id },
        data: { serverSyncSeq: syncSeq },
      });
      const refreshed = await tx.chatMessage.findUnique({
        where: { id: m.id },
        include: {
          sender: { select: USER_SELECT_FIELDS },
          replyTo: { select: { id: true, content: true, sender: { select: USER_SELECT_FIELDS } } },
          reactions: { include: { user: { select: USER_SELECT_FIELDS } } },
          readReceipts: { include: { user: { select: USER_SELECT_FIELDS } } },
        },
      });
      return refreshed ?? m;
    });
    await updateLastMessagePreview(ChatContextType.USER, chatId);
    const socketService = (global as any).socketService;
    if (socketService) {
      socketService.emitChatEvent(
        ChatContextType.USER,
        chatId,
        'message',
        { message },
        message.id,
        message.serverSyncSeq ?? undefined,
        [chat.user1Id, chat.user2Id]
      );
    }
    return message;
  }

  static async respondToChatRequest(chatId: string, messageId: string, respondentId: string, accepted: boolean) {
    const chat = await this.getChatById(chatId, respondentId);
    const msg = await prisma.chatMessage.findFirst({
      where: { id: messageId, contextId: chatId, chatContextType: ChatContextType.USER, deletedAt: null }
    });
    if (!msg || !msg.content) throw new ApiError(404, 'Message not found');
    let parsed: { type?: string; responded?: boolean; requesterId?: string };
    try {
      parsed = JSON.parse(msg.content);
    } catch {
      throw new ApiError(400, 'Invalid message');
    }
    if (parsed.type !== SystemMessageType.USER_CHAT_REQUEST || parsed.responded) {
      throw new ApiError(400, 'Request already responded');
    }
    const requesterId = parsed.requesterId;
    if (!requesterId || (requesterId !== chat.user1Id && requesterId !== chat.user2Id)) {
      throw new ApiError(400, 'Invalid request');
    }
    const isRequesterUser1 = requesterId === chat.user1Id;
    const respondent = isRequesterUser1 ? chat.user2 : chat.user1;
    if (respondent.id !== respondentId) {
      throw new ApiError(403, 'Only the recipient can respond to chat request');
    }
    const type = accepted ? SystemMessageType.USER_CHAT_ACCEPTED : SystemMessageType.USER_CHAT_DECLINED;
    const variables = { userName: getUserDisplayName(respondent.firstName, respondent.lastName) };
    const responseMessage = await SystemMessageService.createSystemMessage(
      chatId,
      { type, variables },
      'PUBLIC',
      ChatContextType.USER
    );
    const updatedContent = JSON.stringify({ ...parsed, responded: true });
    const { MessageService } = await import('./message.service');
    const messageInclude = MessageService.getMessageInclude();
    const { updatedRequest, requestSyncSeq } = await prisma.$transaction(async (tx) => {
      const u = await tx.chatMessage.update({
        where: { id: messageId },
        data: {
          content: updatedContent,
          contentSearchable: computeContentSearchable(updatedContent),
        },
        include: messageInclude,
      });
      const seq = await ChatSyncEventService.appendEventInTransaction(
        tx,
        ChatContextType.USER,
        chatId,
        ChatSyncEventType.MESSAGE_UPDATED,
        chatSyncMessageUpdatedCompactPayload({
          id: u.id,
          content: u.content,
          mentionIds: u.mentionIds,
          editedAt: u.editedAt,
          updatedAt: u.updatedAt,
        })
      );
      await tx.chatMessage.update({
        where: { id: messageId },
        data: { serverSyncSeq: seq },
      });
      return { updatedRequest: u, requestSyncSeq: seq };
    });
    if (accepted) {
      await prisma.userChat.update({
        where: { id: chatId },
        data: isRequesterUser1 ? { user2allowed: true } : { user1allowed: true }
      });
    }
    await updateLastMessagePreview(ChatContextType.USER, chatId);
    const socketService = (global as any).socketService;
    if (socketService) {
      const resSync =
        (responseMessage as { syncSeq?: number }).syncSeq ?? responseMessage.serverSyncSeq ?? undefined;
      socketService.emitChatEvent(
        ChatContextType.USER,
        chatId,
        'message',
        { message: responseMessage },
        responseMessage.id,
        resSync,
        [chat.user1Id, chat.user2Id]
      );
      (updatedRequest as { syncSeq?: number }).syncSeq = requestSyncSeq;
      socketService.emitChatEvent(
        ChatContextType.USER,
        chatId,
        'message',
        { message: updatedRequest },
        updatedRequest.id,
        requestSyncSeq,
        [chat.user1Id, chat.user2Id]
      );
    }
    return { message: responseMessage, userChat: await prisma.userChat.findUnique({ where: { id: chatId }, include: { user1: { select: { ...USER_SELECT_FIELDS, allowMessagesFromNonContacts: true } }, user2: { select: { ...USER_SELECT_FIELDS, allowMessagesFromNonContacts: true } } } }) };
  }
}

