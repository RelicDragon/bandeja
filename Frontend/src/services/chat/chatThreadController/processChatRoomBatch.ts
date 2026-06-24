import { applyThreadEvent, applyThreadL1Put, persistSocketInboundMessage } from '@/services/chat/chatLocalApply';
import { usePlayersStore } from '@/store/playersStore';
import { socketService } from '@/services/socketService';
import type { ChatContextType, ChatMessage } from '@/api/chat';
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
import { scrollChatToBottomIfNearBottom } from '@/utils/chatScrollHelpers';
import { dispatchChatSyncStale } from '@/utils/chatSyncStaleEvents';
import { pullAndApplyChatSyncEventsDirect } from '@/services/chat/chatLocalApplyPull';
import type { ChatRoomEvent } from '@/store/socketEventsStore';
import type { ChatType } from '@/types';
import type { RefObject } from 'react';
import {
  reduceThreadLiveSnapshot,
  type ThreadLiveConfig,
  type ThreadLiveEvent,
  type ThreadLiveEffect,
  type InboundMessageEvent,
  type AllReadEvent,
  type ReadReceiptEvent,
} from '@/services/chat/threadLiveProjection';

export type ProcessChatRoomBatchCtx = {
  id: string | undefined;
  contextType: ChatContextType;
  effectiveChatType: ChatType;
  userId: string | undefined;
  chatContainerRef: RefObject<HTMLDivElement | null>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageWithStatus[]>>;
  messagesRef: React.MutableRefObject<ChatMessageWithStatus[]>;
  onInboundMessage?: (message: ChatMessage) => void;
  handleMessageReaction: (reaction: unknown) => void;
  handleMessageDeleted: (data: { messageId: string }) => void;
  handleMessageUpdated: (updated: ChatMessage) => void;
  /** Thread live config for reducer */
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

/**
 * Check if a ChatRoomEvent is a core event handled by the reducer.
 * Core events: message, readReceipt
 * Stub events (Phase 2): reaction, deleted, messageUpdated
 * Special events: transcription, translation, pollVote
 */
function isCoreReducerEvent(ev: ChatRoomEvent): boolean {
  return ev.kind === 'message' || ev.kind === 'readReceipt';
}

/**
 * Map ChatRoomEvent[] to ThreadLiveEvent[] for the reducer.
 * Only maps core events (message, readReceipt).
 */
function mapBatchToLiveEvents(
  batch: ChatRoomEvent[]
): ThreadLiveEvent[] {
  const events: ThreadLiveEvent[] = [];

  for (const ev of batch) {
    if (ev.kind === 'message') {
      const data = ev.data;
      events.push({
        type: 'inboundMessage',
        message: { ...data.message, syncSeq: data.message.syncSeq ?? data.syncSeq },
      } satisfies InboundMessageEvent);
    } else if (ev.kind === 'readReceipt') {
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
          }).catch(() => { });
        }
        break;
      }
      case 'ack': {
        void onSocketSyncSeq(contextType, contextId, effect.syncSeq).catch(() => { });
        break;
      }
      case 'clearUnread': {
        if (contextType === 'USER') {
          usePlayersStore.getState().updateUnreadCount(contextId, 0);
          void patchThreadIndexClearUnread('USER', contextId);
        } else if (contextType === 'GROUP') {
          window.dispatchEvent(
            new CustomEvent('chat-viewing-clear-unread', {
              detail: { contextType: 'GROUP', contextId },
            })
          );
        } else if (contextType === 'GAME') {
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
        }).catch(() => { });
        break;
      }
      case 'syncPull': {
        if (effect.reason === 'allRead') {
          void pullAndApplyChatSyncEventsDirect(contextType, contextId).catch(() => { });
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
    chatContainerRef,
    setMessages,
    messagesRef,
    handleMessageReaction,
    handleMessageDeleted,
    handleMessageUpdated,
    threadLiveConfig,
    onInboundMessage,
  } = ctx;
  if (!id || batch.length === 0) return;

  // Separate events into reducer events and legacy events
  const reducerEvents: ChatRoomEvent[] = [];
  const legacyEvents: ChatRoomEvent[] = [];
  let transcriptionPatch: {
    messageId: string;
    audioTranscription: ChatMessage['audioTranscription'];
  } | null = null;
  let pollPatch: { messageId: string; updatedPoll: import('@/api/chat').Poll } | null = null;

  for (const ev of batch) {
    if (isCoreReducerEvent(ev)) {
      reducerEvents.push(ev);
    } else if (ev.kind === 'transcription') {
      const lastChatMessageTranscription = ev.data;
      const { messageId, audioTranscription } = lastChatMessageTranscription;
      void persistSocketTranscriptionAndSyncSeq(
        contextType,
        id,
        messageId,
        audioTranscription,
        lastChatMessageTranscription.syncSeq
      ).catch(() => { });
      transcriptionPatch = { messageId, audioTranscription };
    } else if (ev.kind === 'pollVote') {
      const lastPollVote = ev.data;
      void persistSocketPollVoteAndSyncSeq(
        contextType,
        id,
        lastPollVote.messageId,
        lastPollVote.updatedPoll,
        lastPollVote.syncSeq
      ).catch(() => { });
      pollPatch = { messageId: lastPollVote.messageId, updatedPoll: lastPollVote.updatedPoll };
    } else if (ev.kind === 'translation') {
      const d = ev.data;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('chat:message-translation', { detail: d }));
      }
    } else {
      // Stub events: reaction, deleted, messageUpdated
      // Use legacy handlers for now (Phase 2)
      legacyEvents.push(ev);
    }
  }

  if (reducerEvents.length > 0) {
    const prev = messagesRef.current;
    const liveEvents = mapBatchToLiveEvents(reducerEvents);

    const result = reduceThreadLiveSnapshot(prev, liveEvents, threadLiveConfig);

    // Apply state change synchronously (paint)
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

  // Handle stub events via legacy handlers (Phase 2)
  for (const ev of legacyEvents) {
    switch (ev.kind) {
      case 'reaction': {
        const lastChatReaction = ev.data;
        void persistReactionSocketPayload(lastChatReaction.reaction).catch(() => { });
        void onSocketSyncSeq(contextType, id, lastChatReaction.syncSeq).catch(() => { });
        handleMessageReaction(lastChatReaction.reaction);
        break;
      }
      case 'deleted': {
        const lastChatDeleted = ev.data;
        void markLocalMessageDeleted(lastChatDeleted.messageId).catch(() => { });
        void onSocketSyncSeq(contextType, id, lastChatDeleted.syncSeq).catch(() => { });
        handleMessageDeleted({ messageId: lastChatDeleted.messageId });
        break;
      }
      case 'messageUpdated': {
        const lastChatMessageUpdated = ev.data;
        if (!lastChatMessageUpdated.message) break;
        const m = lastChatMessageUpdated.message;
        handleMessageUpdated({
          ...m,
          translation: undefined,
          translations: undefined,
        });
        persistInboundMessageWithRecovery(contextType, id, m, lastChatMessageUpdated.syncSeq);
        break;
      }
      default:
        break;
    }
  }

  // Handle transcription and pollVote patches
  if (transcriptionPatch || pollPatch) {
    setMessages((prev) => {
      let next = prev;
      if (transcriptionPatch) {
        const idx = next.findIndex((m) => m.id === transcriptionPatch!.messageId);
        if (idx >= 0) {
          const copy = [...next];
          copy[idx] = { ...copy[idx], audioTranscription: transcriptionPatch!.audioTranscription };
          next = copy;
        }
      }
      if (pollPatch) {
        next = next.map((message) =>
          message.id === pollPatch!.messageId && message.poll
            ? { ...message, poll: pollPatch!.updatedPoll }
            : message
        );
      }
      messagesRef.current = next;
      const lastId = next[next.length - 1]?.id;
      if (lastId) {
        void applyThreadEvent({
          kind: 'uiTailAdvance',
          contextType,
          contextId: id,
          messageId: lastId,
          gameChatType: contextType === 'GAME' ? effectiveChatType : undefined,
        });
      }
      return next;
    });
    scrollChatToBottomIfNearBottom(chatContainerRef);
  }

  // Always update L1 cache with latest state
  void applyThreadL1Put({
    contextType,
    contextId: id,
    gameChatType: contextType === 'GAME' ? effectiveChatType : undefined,
    readRows: () => messagesRef.current,
    verify: () => true,
  });
}
