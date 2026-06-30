import { applyThreadL1Put, persistSocketInboundMessage } from '@/services/chat/chatLocalApply';
import { applyUnreadSocketDelta } from '@/services/chat/unreadStoreSocketBridge';
import { socketService } from '@/services/socketService';
import type { ChatContextType, ChatMessage, MessageReaction } from '@/api/chat';
import type { ChatMessageWithStatus } from '@/api/chat';
import {
  markLocalMessageDeleted,
  onSocketSyncSeq,
  patchLocalReadReceipt,
  persistReactionSocketPayload,
  persistSocketPollVoteAndSyncSeq,
  persistSocketTranscriptionAndSyncSeq,
} from '@/services/chat/chatLocalApply';
import { patchThreadIndexClearUnread } from '@/services/chat/chatThreadIndex';
import { dispatchChatSyncStale } from '@/utils/chatSyncStaleEvents';
import { pullAndApplyChatSyncEventsDirect } from '@/services/chat/chatLocalApplyPull';
import type { ChatRoomEvent } from '@/store/socketEventsStore';
import type { ChatType } from '@/types';
import {
  reduceThreadLiveSnapshot,
  type AllReadEvent,
  type InboundMessageEvent,
  type ReadReceiptEvent,
  type ThreadLiveConfig,
  type ThreadLiveEffect,
  type ThreadLiveEvent,
} from '@/services/chat/threadLiveProjection';

export type ProcessChatRoomBatchCtx = {
  id: string | undefined;
  contextType: ChatContextType;
  effectiveChatType: ChatType;
  userId: string | undefined;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageWithStatus[]>>;
  messagesRef: React.MutableRefObject<ChatMessageWithStatus[]>;
  onInboundMessage?: (message: ChatMessage) => void;
  threadLiveConfig: ThreadLiveConfig;
};

function persistInboundMessageWithRecovery(
  contextType: ChatContextType,
  contextId: string,
  message: ChatMessage,
  syncSeq: number | undefined
): void {
  const attempt = () => persistSocketInboundMessage(contextType, contextId, message, syncSeq);
  void attempt().catch(() => {
    void attempt().catch(() => {
      dispatchChatSyncStale(contextType, contextId, 'cursorStale');
    });
  });
}

function mapBatchToLiveEvents(batch: ChatRoomEvent[]): ThreadLiveEvent[] {
  const events: ThreadLiveEvent[] = [];

  for (const ev of batch) {
    switch (ev.kind) {
      case 'message': {
        const data = ev.data;
        events.push({
          type: 'inboundMessage',
          message: { ...data.message, syncSeq: data.message.syncSeq ?? data.syncSeq },
        } satisfies InboundMessageEvent);
        break;
      }
      case 'readReceipt': {
        const data = ev.data;
        const rr = data.readReceipt;
        const readAt =
          rr?.readAt == null
            ? undefined
            : typeof rr.readAt === 'string'
              ? rr.readAt
              : new Date(rr.readAt as string | number | Date).toISOString();

        if (rr?.allRead && rr.userId && readAt) {
          events.push({
            type: 'allRead',
            readerUserId: rr.userId,
            readAt,
          } satisfies AllReadEvent);
        } else if (rr?.messageId && rr.userId && readAt) {
          events.push({
            type: 'readReceipt',
            receipt: {
              id: `receipt-${rr.messageId}-${rr.userId}`,
              messageId: rr.messageId,
              userId: rr.userId,
              readAt,
            },
            messageId: rr.messageId,
          } satisfies ReadReceiptEvent);
        }
        break;
      }
      case 'reaction': {
        const reaction = ev.data.reaction as MessageReaction & { action?: string };
        if (!reaction?.messageId) break;
        events.push({
          type: 'reaction',
          messageId: reaction.messageId,
          reaction,
          removed: reaction.action === 'removed',
          syncSeq: ev.data.syncSeq,
        });
        break;
      }
      case 'deleted': {
        events.push({
          type: 'messageDeleted',
          messageId: ev.data.messageId,
          deletedAt: new Date().toISOString(),
          syncSeq: ev.data.syncSeq,
        });
        break;
      }
      case 'messageUpdated': {
        const message = ev.data.message;
        if (!message) break;
        events.push({
          type: 'messageUpdated',
          messageId: message.id,
          message,
          updatedAt: message.updatedAt,
          syncSeq: ev.data.syncSeq,
        });
        break;
      }
      case 'transcription': {
        events.push({
          type: 'messageUpdated',
          messageId: ev.data.messageId,
          audioTranscription: ev.data.audioTranscription,
          updatedAt: ev.data.timestamp,
          syncSeq: ev.data.syncSeq,
        });
        break;
      }
      case 'pollVote': {
        events.push({
          type: 'messageUpdated',
          messageId: ev.data.messageId,
          poll: ev.data.updatedPoll,
          syncSeq: ev.data.syncSeq,
        });
        break;
      }
      case 'translation':
        break;
      default:
        break;
    }
  }

  return events;
}

function executeThreadLiveEffects(
  effects: ThreadLiveEffect[],
  contextType: ChatContextType,
  contextId: string,
  viewerUserId: string | undefined,
  gameChatType: ChatType | undefined
): void {
  for (const effect of effects) {
    switch (effect.type) {
      case 'persist': {
        const event = effect.event;
        if (event.type === 'inboundMessage') {
          const message = event.message;
          const syncSeq = message.syncSeq;

          persistInboundMessageWithRecovery(contextType, contextId, message, syncSeq);

          if (message.senderId !== viewerUserId && message.id) {
            socketService.acknowledgeMessage(
              message.id,
              contextType as 'GAME' | 'BUG' | 'USER' | 'GROUP',
              contextId
            );
            socketService.confirmMessageReceipt(message.id, 'socket');
          }
        } else if (event.type === 'readReceipt') {
          const { receipt, messageId } = event;
          void patchLocalReadReceipt({
            messageId,
            userId: receipt.userId,
            readAt: receipt.readAt,
          }).catch(() => {});
        } else if (event.type === 'reaction') {
          void persistReactionSocketPayload(event.reaction).catch(() => {});
          void onSocketSyncSeq(contextType, contextId, event.syncSeq).catch(() => {});
        } else if (event.type === 'messageDeleted') {
          void markLocalMessageDeleted(event.messageId, event.deletedAt).catch(() => {});
          void onSocketSyncSeq(contextType, contextId, event.syncSeq).catch(() => {});
        } else if (event.type === 'messageUpdated') {
          if (event.message) {
            persistInboundMessageWithRecovery(contextType, contextId, event.message, event.syncSeq);
          } else if (event.audioTranscription) {
            void persistSocketTranscriptionAndSyncSeq(
              contextType,
              contextId,
              event.messageId,
              event.audioTranscription,
              event.syncSeq
            ).catch(() => {});
          } else if (event.poll) {
            void persistSocketPollVoteAndSyncSeq(
              contextType,
              contextId,
              event.messageId,
              event.poll,
              event.syncSeq
            ).catch(() => {});
          } else {
            void onSocketSyncSeq(contextType, contextId, event.syncSeq).catch(() => {});
          }
        }
        break;
      }
      case 'ack': {
        void onSocketSyncSeq(contextType, contextId, effect.syncSeq).catch(() => {});
        break;
      }
      case 'clearUnread': {
        if (contextType === 'USER') {
          applyUnreadSocketDelta({ contextType: 'USER', contextId, unreadCount: 0 });
          void patchThreadIndexClearUnread('USER', contextId);
        } else if (contextType === 'GROUP') {
          applyUnreadSocketDelta({ contextType: 'GROUP', contextId, unreadCount: 0 });
          window.dispatchEvent(
            new CustomEvent('chat-viewing-clear-unread', {
              detail: { contextType: 'GROUP', contextId },
            })
          );
        } else if (contextType === 'GAME') {
          applyUnreadSocketDelta({ contextType: 'GAME', contextId, unreadCount: 0 });
          void patchThreadIndexClearUnread('GAME', contextId);
        }
        break;
      }
      case 'l1Put': {
        void applyThreadL1Put({
          contextType,
          contextId,
          gameChatType,
          readRows: () => effect.messages,
          verify: () => true,
        }).catch(() => {});
        break;
      }
      case 'syncPull': {
        if (effect.reason === 'allRead') {
          void pullAndApplyChatSyncEventsDirect(contextType, contextId).catch(() => {});
        }
        break;
      }
      case 'reconcileAck':
      case 'scroll': {
        break;
      }
      default:
        break;
    }
  }
}

export function processChatRoomBatch(batch: ChatRoomEvent[], ctx: ProcessChatRoomBatchCtx): void {
  const {
    id,
    contextType,
    effectiveChatType,
    userId,
    setMessages,
    messagesRef,
    threadLiveConfig,
    onInboundMessage,
  } = ctx;
  if (!id || batch.length === 0) return;

  for (const ev of batch) {
    if (ev.kind !== 'translation') continue;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('chat:message-translation', { detail: ev.data }));
    }
  }

  const liveEvents = mapBatchToLiveEvents(batch);
  if (liveEvents.length > 0) {
    const result = reduceThreadLiveSnapshot(messagesRef.current, liveEvents, threadLiveConfig);

    if (result.changed) {
      setMessages(result.next);
      messagesRef.current = result.next;
    }

    for (const event of liveEvents) {
      if (event.type === 'inboundMessage') onInboundMessage?.(event.message);
    }

    executeThreadLiveEffects(
      result.effects,
      contextType,
      id,
      userId,
      contextType === 'GAME' ? effectiveChatType : undefined
    );
  }

  void applyThreadL1Put({
    contextType,
    contextId: id,
    gameChatType: contextType === 'GAME' ? effectiveChatType : undefined,
    readRows: () => messagesRef.current,
    verify: () => true,
  });
}
