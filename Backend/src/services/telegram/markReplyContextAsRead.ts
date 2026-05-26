import { ChatContextType, ChatType } from '@prisma/client';
import prisma from '../../config/database';
import { ReadReceiptService } from '../chat/readReceipt.service';

export async function markReplyContextAsRead(params: {
  userId: string;
  chatContextType: 'GAME' | 'USER' | 'BUG' | 'GROUP';
  contextId: string;
  chatType: ChatType;
}): Promise<void> {
  const { userId, chatContextType, contextId, chatType } = params;

  let result: { count: number; syncSeq?: number };
  if (chatContextType === 'GAME') {
    result = await ReadReceiptService.markAllMessagesAsRead(contextId, userId, [chatType]);
  } else {
    result = await ReadReceiptService.markAllMessagesAsReadForContext(
      chatContextType as ChatContextType,
      contextId,
      userId
    );
  }

  const socketService = (global as any).socketService;
  if (!socketService) return;

  const socketContextType = chatContextType as ChatContextType;
  if (result.count > 0 && result.syncSeq != null) {
    let notifyUserIds: string[] | undefined;
    if (chatContextType === 'USER') {
      const peers = await prisma.userChat.findUnique({
        where: { id: contextId },
        select: { user1Id: true, user2Id: true },
      });
      if (peers) {
        notifyUserIds = [peers.user1Id, peers.user2Id].filter(
          (id): id is string => typeof id === 'string' && id.length > 0
        );
      }
    }
    socketService.emitChatEvent(
      socketContextType,
      contextId,
      'read-receipt',
      {
        readReceipt: {
          userId,
          readAt: new Date().toISOString(),
          allRead: true,
        },
      },
      undefined,
      result.syncSeq,
      notifyUserIds
    );
  }

  const unreadCount = await ReadReceiptService.getUnreadCountForContext(
    socketContextType,
    contextId,
    userId
  );
  await socketService.emitUnreadCountUpdate(socketContextType, contextId, userId, unreadCount);
}
