import type { ChatContextType, ChatType } from '@prisma/client';
import type { ChatEventType, ChatNotifier } from './chatNotifier';

type SocketServiceLike = {
  emitChatEvent: ChatNotifier['emitChatEvent'];
  recordMessageDelivery: ChatNotifier['recordMessageDelivery'];
  emitUnreadCountUpdate: ChatNotifier['emitUnreadCountUpdate'];
  getUndeliveredRecipients: ChatNotifier['getUndeliveredRecipients'];
  isUserOnline: ChatNotifier['isUserOnline'];
  isUserInChatRoom: ChatNotifier['isUserInChatRoom'];
  emitMessageTranslation: ChatNotifier['emitMessageTranslation'];
  emitPinnedMessagesUpdated: ChatNotifier['emitPinnedMessagesUpdated'];
  markSocketDelivered: ChatNotifier['markSocketDelivered'];
  markPushDelivered: ChatNotifier['markPushDelivered'];
  emitMessageTranscription: ChatNotifier['emitMessageTranscription'];
};

function getSocketService(): SocketServiceLike | undefined {
  return (global as { socketService?: SocketServiceLike }).socketService;
}

class SocketChatNotifier implements ChatNotifier {
  emitChatEvent(
    contextType: ChatContextType,
    contextId: string,
    eventType: ChatEventType,
    data: unknown,
    messageId?: string,
    syncSeq?: number,
    notifyUserIds?: string[]
  ): void {
    getSocketService()?.emitChatEvent(
      contextType,
      contextId,
      eventType,
      data,
      messageId,
      syncSeq,
      notifyUserIds
    );
  }

  recordMessageDelivery(
    messageId: string,
    contextType: ChatContextType,
    contextId: string,
    recipients: string[]
  ): void {
    getSocketService()?.recordMessageDelivery(messageId, contextType, contextId, recipients);
  }

  async emitUnreadCountUpdate(
    contextType: ChatContextType,
    contextId: string,
    userId: string,
    unreadCount: number,
    lastMessage?: Record<string, unknown>
  ): Promise<void> {
    const socketService = getSocketService();
    if (!socketService) return;
    await socketService.emitUnreadCountUpdate(
      contextType,
      contextId,
      userId,
      unreadCount,
      lastMessage
    );
  }

  emitMessageTranslation(
    contextType: ChatContextType,
    contextId: string,
    messageId: string,
    payload: { languageCode: string; translation: string; removed?: boolean },
    syncSeq?: number
  ): void {
    getSocketService()?.emitMessageTranslation(
      contextType,
      contextId,
      messageId,
      payload,
      syncSeq
    );
  }

  emitPinnedMessagesUpdated(
    contextType: ChatContextType,
    contextId: string,
    chatType: ChatType,
    syncSeq?: number
  ): void {
    getSocketService()?.emitPinnedMessagesUpdated(contextType, contextId, chatType, syncSeq);
  }

  getUndeliveredRecipients(messageId: string): string[] {
    return getSocketService()?.getUndeliveredRecipients(messageId) ?? [];
  }

  isUserOnline(userId: string): boolean {
    return getSocketService()?.isUserOnline(userId) ?? false;
  }

  async isUserInChatRoom(
    contextType: ChatContextType,
    contextId: string,
    userId: string
  ): Promise<boolean> {
    const socketService = getSocketService();
    if (!socketService) return false;
    return socketService.isUserInChatRoom(contextType, contextId, userId);
  }

  markSocketDelivered(messageId: string, userId: string): void {
    getSocketService()?.markSocketDelivered(messageId, userId);
  }

  markPushDelivered(messageId: string, userId: string): void {
    getSocketService()?.markPushDelivered(messageId, userId);
  }

  emitMessageTranscription(
    contextType: ChatContextType,
    contextId: string,
    messageId: string,
    audioTranscription: { transcription: string; languageCode: string | null },
    syncSeq?: number
  ): void {
    getSocketService()?.emitMessageTranscription(
      contextType,
      contextId,
      messageId,
      audioTranscription,
      syncSeq
    );
  }
}

export const socketChatNotifier = new SocketChatNotifier();
