import type { ChatContextType, ChatType } from '@prisma/client';
import type { UnreadAuthorityEnvelope } from './unreadAuthority/types';
import { socketChatNotifier } from './socketChatNotifier';

export type ChatEventType =
  | 'message'
  | 'message-updated'
  | 'reaction'
  | 'read-receipt'
  | 'deleted'
  | 'poll-vote';

export interface ChatNotifier {
  emitChatEvent(
    contextType: ChatContextType,
    contextId: string,
    eventType: ChatEventType,
    data: unknown,
    messageId?: string,
    syncSeq?: number,
    notifyUserIds?: string[]
  ): void;

  emitUnreadCountUpdate(
    contextType: ChatContextType,
    contextId: string,
    userId: string,
    unreadCount: number,
    lastMessage?: Record<string, unknown>
  ): Promise<void>;

  emitUnreadAuthorityEnvelope(userId: string, envelope: UnreadAuthorityEnvelope): Promise<void>;

  emitUnreadInvalidate(
    userId: string,
    payload: { userUnreadRevision: number; reason: 'auto_read' | 'repair' | 'mark_all_read' }
  ): Promise<void>;

  emitMessageTranslation(
    contextType: ChatContextType,
    contextId: string,
    messageId: string,
    payload: { languageCode: string; translation: string; removed?: boolean },
    syncSeq?: number
  ): void;

  emitPinnedMessagesUpdated(
    contextType: ChatContextType,
    contextId: string,
    chatType: ChatType,
    syncSeq?: number
  ): void;

  recordMessageDelivery(
    messageId: string,
    contextType: ChatContextType,
    contextId: string,
    recipients: string[]
  ): void;

  getUndeliveredRecipients(messageId: string): string[];

  isUserOnline(userId: string): boolean;

  isUserInChatRoom(
    contextType: ChatContextType,
    contextId: string,
    userId: string
  ): Promise<boolean>;

  markSocketDelivered(messageId: string, userId: string): void;

  markPushDelivered(messageId: string, userId: string): void;

  emitMessageTranscription(
    contextType: ChatContextType,
    contextId: string,
    messageId: string,
    audioTranscription: { transcription: string; languageCode: string | null },
    syncSeq?: number,
    relatedMessageIds?: string[]
  ): void;
}

let injectedNotifier: ChatNotifier | null | undefined;

export function setChatNotifierForTests(notifier: ChatNotifier | null): void {
  injectedNotifier = notifier;
}

export function resetChatNotifierForTests(): void {
  injectedNotifier = undefined;
}

export function getChatNotifier(): ChatNotifier {
  if (injectedNotifier !== undefined) {
    return injectedNotifier ?? socketChatNotifier;
  }
  return socketChatNotifier;
}
