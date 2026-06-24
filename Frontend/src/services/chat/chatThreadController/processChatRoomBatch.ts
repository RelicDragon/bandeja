import { applyThreadEvent, applyThreadL1Put } from '@/services/chat/chatLocalApply';
import { usePlayersStore } from '@/store/playersStore';
import { socketService } from '@/services/socketService';
import type { ChatContextType, ChatMessage } from '@/api/chat';
import type { ChatMessageWithStatus } from '@/api/chat';
import {
  markLocalMessageDeleted,
  onSocketSyncSeq,
  patchLocalReadReceipt,
  persistReactionSocketPayload,
  persistSocketInboundMessage,
  persistSocketPollVoteAndSyncSeq,
  persistSocketTranscriptionAndSyncSeq,
} from '@/services/chat/chatLocalApply';
import { patchThreadIndexClearUnread } from '@/services/chat/chatThreadIndex';
import { scrollChatToBottomIfNearBottom } from '@/utils/chatScrollHelpers';
import { dispatchChatSyncStale } from '@/utils/chatSyncStaleEvents';
import { applyAllReadToOwnVisibleMessages } from '@/services/chat/chatSyncReadBatchReact';
import { pullAndApplyChatSyncEventsDirect } from '@/services/chat/chatLocalApplyPull';
import type { ChatRoomEvent } from '@/store/socketEventsStore';
import type { ChatType } from '@/types';
import type { RefObject } from 'react';

export type ProcessChatRoomBatchCtx = {
  id: string | undefined;
  contextType: ChatContextType;
  effectiveChatType: ChatType;
  userId: string | undefined;
  chatContainerRef: RefObject<HTMLDivElement | null>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageWithStatus[]>>;
  messagesRef: React.MutableRefObject<ChatMessageWithStatus[]>;
  handleNewMessage: (message: ChatMessage) => string | void;
  handleMessageReaction: (reaction: unknown) => void;
  handleReadReceipt: (readReceipt: unknown) => void;
  handleMessageDeleted: (data: { messageId: string }) => void;
  fetchPinnedMessages: () => void;
  handleMessageUpdated: (updated: ChatMessage) => void;
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

export function processChatRoomBatch(batch: ChatRoomEvent[], ctx: ProcessChatRoomBatchCtx): void {
  const {
    id,
    contextType,
    effectiveChatType,
    userId,
    chatContainerRef,
    setMessages,
    messagesRef,
    handleNewMessage,
    handleMessageReaction,
    handleReadReceipt,
    handleMessageDeleted,
    fetchPinnedMessages: _fetchPinnedMessages,
    handleMessageUpdated,
  } = ctx;
  if (!id || batch.length === 0) return;

  let transcriptionPatch: {
    messageId: string;
    audioTranscription: ChatMessage['audioTranscription'];
  } | null = null;
  let pollPatch: { messageId: string; updatedPoll: import('@/api/chat').Poll } | null = null;

  for (const ev of batch) {
    switch (ev.kind) {
      case 'message': {
        const lastChatMessage = ev.data;
        handleNewMessage(lastChatMessage.message);
        persistInboundMessageWithRecovery(
          contextType,
          id,
          lastChatMessage.message,
          lastChatMessage.syncSeq
        );

        if (id) {
          if (contextType === 'USER') {
            usePlayersStore.getState().updateUnreadCount(id, 0);
            void patchThreadIndexClearUnread('USER', id);
          } else if (contextType === 'GROUP') {
            window.dispatchEvent(
              new CustomEvent('chat-viewing-clear-unread', { detail: { contextType: 'GROUP', contextId: id } })
            );
          } else if (contextType === 'GAME') {
            void patchThreadIndexClearUnread('GAME', id);
          }
        }

        if (lastChatMessage.messageId && lastChatMessage.message?.senderId !== userId) {
          socketService.acknowledgeMessage(
            lastChatMessage.messageId,
            contextType as 'GAME' | 'BUG' | 'USER' | 'GROUP',
            id
          );
          socketService.confirmMessageReceipt(lastChatMessage.messageId, 'socket');
        }
        break;
      }
      case 'reaction': {
        const lastChatReaction = ev.data;
        void persistReactionSocketPayload(lastChatReaction.reaction).catch(() => {});
        void onSocketSyncSeq(contextType, id, lastChatReaction.syncSeq).catch(() => {});
        handleMessageReaction(lastChatReaction.reaction);
        break;
      }
      case 'readReceipt': {
        const lastChatReadReceipt = ev.data;
        const rr = lastChatReadReceipt.readReceipt;
        const readAt =
          rr?.readAt == null
            ? undefined
            : typeof rr.readAt === 'string'
              ? rr.readAt
              : new Date(rr.readAt as string | number | Date).toISOString();

        void onSocketSyncSeq(contextType, id, lastChatReadReceipt.syncSeq).catch(() => {});

        if (rr?.allRead && rr.userId && readAt && userId) {
          setMessages((prev) => {
            const { next, changed, messageIds } = applyAllReadToOwnVisibleMessages(
              prev,
              rr.userId,
              readAt,
              userId
            );
            if (!changed) return prev;
            messagesRef.current = next;
            for (const messageId of messageIds) {
              void patchLocalReadReceipt({ messageId, userId: rr.userId, readAt }).catch(() => {});
            }
            return next;
          });
          void pullAndApplyChatSyncEventsDirect(contextType, id).catch(() => {});
        } else if (rr?.messageId && rr.userId && readAt) {
          void patchLocalReadReceipt({
            messageId: rr.messageId,
            userId: rr.userId,
            readAt,
          }).catch(() => {});
          handleReadReceipt({ messageId: rr.messageId, userId: rr.userId, readAt });
        }
        break;
      }
      case 'deleted': {
        const lastChatDeleted = ev.data;
        void markLocalMessageDeleted(lastChatDeleted.messageId).catch(() => {});
        void onSocketSyncSeq(contextType, id, lastChatDeleted.syncSeq).catch(() => {});
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
      case 'transcription': {
        const lastChatMessageTranscription = ev.data;
        const { messageId, audioTranscription } = lastChatMessageTranscription;
        void persistSocketTranscriptionAndSyncSeq(
          contextType,
          id,
          messageId,
          audioTranscription,
          lastChatMessageTranscription.syncSeq
        ).catch(() => {});
        transcriptionPatch = { messageId, audioTranscription };
        break;
      }
      case 'translation': {
        const d = ev.data;
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('chat:message-translation', { detail: d }));
        }
        break;
      }
      case 'pollVote': {
        const lastPollVote = ev.data;
        void persistSocketPollVoteAndSyncSeq(
          contextType,
          id,
          lastPollVote.messageId,
          lastPollVote.updatedPoll,
          lastPollVote.syncSeq
        ).catch(() => {});
        pollPatch = { messageId: lastPollVote.messageId, updatedPoll: lastPollVote.updatedPoll };
        break;
      }
      default:
        break;
    }
  }

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

  void applyThreadL1Put({
    contextType,
    contextId: id,
    gameChatType: contextType === 'GAME' ? effectiveChatType : undefined,
    readRows: () => messagesRef.current,
    verify: () => true,
  });
}
