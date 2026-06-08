import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { applyThreadEvent, applyThreadL1Put } from '@/services/chat/chatLocalApply';
import { useChatSyncStore } from '@/store/chatSyncStore';
import { useSocketEventsStore, type ChatRoomEvent } from '@/store/socketEventsStore';
import { useGameDetailsChromeStore } from '@/components/GameDetails/gameDetailsChromeStore';
import { usePlayersStore } from '@/store/playersStore';
import { socketService } from '@/services/socketService';
import type { ChatContextType } from '@/api/chat';
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
import { chatSyncTailKey } from '@/utils/chatSyncScope';
import { useThreadSnapshotRevision } from '@/services/chat/chatThreadController/useThreadSnapshotRevision';
import { BANDEJA_CHAT_SYNC_STALE, type ChatSyncStaleDetail } from '@/utils/chatSyncStaleEvents';
import {
  BANDEJA_CHAT_READ_BATCH_APPLIED,
  type ChatReadBatchAppliedDetail,
} from '@/utils/chatReadBatchEvents';
import { applySyncReadBatchToMessages } from '@/services/chat/chatSyncReadBatchReact';
import type { ChatType } from '@/types';
import {
  appendChatRoomPending,
  clearChatRoomPending,
  takeChatRoomPending,
} from '@/services/chat/chatOpenSocketPending';
import { scheduleAfterThreadPaint, scheduleChatOpenIdle } from '@/utils/chatOpenIdle';
import { logChatSyncStale } from '@/services/chat/chatOpenTrace';
import {
  canFlushSocketBacklog,
  reconcileAfterPaint,
  shouldDeferOpenReload,
} from '@/services/chat/threadOpen';

export interface UseThreadSocketParams {
  id: string | undefined;
  contextType: ChatContextType;
  effectiveChatType: ChatType;
  currentIdRef: RefObject<string | undefined>;
  userId: string | undefined;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageWithStatus[]>>;
  messagesRef: React.MutableRefObject<ChatMessageWithStatus[]>;
  chatContainerRef: RefObject<HTMLDivElement | null>;
  handleNewMessage: (message: import('@/api/chat').ChatMessage) => string | void;
  handleMessageReaction: (reaction: any) => void;
  handleReadReceipt: (readReceipt: any) => void;
  handleMessageDeleted: (data: { messageId: string }) => void;
  fetchPinnedMessages: () => void;
  handleMessageUpdated: (updated: import('@/api/chat').ChatMessage) => void;
  reloadMessagesFirstPage: () => void | Promise<void>;
  onAfterSocketBatch?: () => void;
}

type RoomProcessorCtx = Pick<
  UseThreadSocketParams,
  | 'id'
  | 'contextType'
  | 'effectiveChatType'
  | 'userId'
  | 'chatContainerRef'
  | 'setMessages'
  | 'messagesRef'
  | 'handleNewMessage'
  | 'handleMessageReaction'
  | 'handleReadReceipt'
  | 'handleMessageDeleted'
  | 'fetchPinnedMessages'
  | 'handleMessageUpdated'
>;

function processChatRoomBatch(batch: ChatRoomEvent[], ctx: RoomProcessorCtx): void {
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
    audioTranscription: import('@/api/chat').ChatMessage['audioTranscription'];
  } | null = null;
  let pollPatch: { messageId: string; updatedPoll: import('@/api/chat').Poll } | null = null;

  for (const ev of batch) {
    switch (ev.kind) {
      case 'message': {
        const lastChatMessage = ev.data;
        void persistSocketInboundMessage(contextType, id, lastChatMessage.message, lastChatMessage.syncSeq)
          .then(() => {
            handleNewMessage(lastChatMessage.message);
          })
          .catch(() => {});

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
        void onSocketSyncSeq(contextType, id, lastChatReadReceipt.syncSeq).catch(() => {});
        if (rr?.messageId && rr?.userId && rr?.readAt && !rr.allRead) {
          void patchLocalReadReceipt({
            messageId: rr.messageId,
            userId: rr.userId,
            readAt: typeof rr.readAt === 'string' ? rr.readAt : new Date(rr.readAt).toISOString(),
          }).catch(() => {});
        }
        handleReadReceipt(rr);
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
        void persistSocketInboundMessage(contextType, id, lastChatMessageUpdated.message, lastChatMessageUpdated.syncSeq)
          .then(() => {
            const m = lastChatMessageUpdated.message;
            handleMessageUpdated({
              ...m,
              translation: undefined,
              translations: undefined,
            });
          })
          .catch(() => {});
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

export function useThreadSocket({
  id,
  contextType,
  effectiveChatType,
  currentIdRef,
  userId,
  setMessages,
  messagesRef,
  chatContainerRef,
  handleNewMessage,
  handleMessageReaction,
  handleReadReceipt,
  handleMessageDeleted,
  fetchPinnedMessages,
  handleMessageUpdated,
  reloadMessagesFirstPage,
  onAfterSocketBatch,
}: UseThreadSocketParams) {
  const snapshotRevision = useThreadSnapshotRevision(contextType, id);
  const roomKey = useMemo(
    () => (id ? `${contextType}:${id}` : ''),
    [contextType, id]
  );
  const roomPushSeq = useSocketEventsStore((s) => (roomKey ? s.chatRoomPushSeq[roomKey] ?? 0 : 0));
  const syncRequiredEpoch = useSocketEventsStore((s) => s.syncRequiredEpoch);
  const lastSyncRequired = useSocketEventsStore((s) => s.lastSyncRequired);
  const syncEpochBaselineRef = useRef<number | null>(null);
  const roomProcessorCtx = useMemo(
    (): RoomProcessorCtx => ({
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
      fetchPinnedMessages,
      handleMessageUpdated,
    }),
    [
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
      fetchPinnedMessages,
      handleMessageUpdated,
    ]
  );

  useEffect(() => {
    if (!id) return;
    const setupSocket = async () => {
      await socketService.joinChatRoom(contextType, id);
    };
    setupSocket();
    return () => {
      socketService.leaveChatRoom(contextType, id);
      if (roomKey) clearChatRoomPending(roomKey);
    };
  }, [id, contextType, roomKey]);

  useEffect(() => {
    if (contextType === 'GROUP' && id) {
      useGameDetailsChromeStore.getState().setViewingGroupChannelId(id);
      return () => useGameDetailsChromeStore.getState().setViewingGroupChannelId(null);
    }
    if (contextType === 'USER' && id) {
      useGameDetailsChromeStore.getState().setViewingUserChatId(id);
      return () => useGameDetailsChromeStore.getState().setViewingUserChatId(null);
    }
    if (contextType === 'GAME' && id) {
      useGameDetailsChromeStore.getState().setViewingGameChat(id, effectiveChatType);
      return () => useGameDetailsChromeStore.getState().setViewingGameChat(null, null);
    }
  }, [contextType, id, effectiveChatType]);

  useEffect(() => {
    if (!roomKey || !id) return;

    const batch = useSocketEventsStore.getState().takeChatRoomQueue(roomKey);
    if (batch.length > 0) appendChatRoomPending(roomKey, batch);
  }, [roomPushSeq, roomKey, id]);

  useEffect(() => {
    if (!roomKey || !id) return;
    const tailKey = chatSyncTailKey(
      contextType,
      id,
      contextType === 'GAME' ? effectiveChatType : undefined
    );
    const flush = () => {
      if (currentIdRef.current !== id) return;
      if (!canFlushSocketBacklog(tailKey)) {
        scheduleAfterThreadPaint(flush);
        return;
      }
      const batch = takeChatRoomPending(roomKey);
      if (batch.length === 0) return;
      processChatRoomBatch(batch, roomProcessorCtx);
      onAfterSocketBatch?.();
    };
    scheduleAfterThreadPaint(flush);
  }, [roomKey, id, roomPushSeq, roomProcessorCtx, currentIdRef, onAfterSocketBatch, contextType, effectiveChatType]);

  useEffect(() => {
    syncEpochBaselineRef.current = null;
  }, [id, contextType]);

  useEffect(() => {
    if (!id) return;
    const ep = syncRequiredEpoch;
    const currentMessages = messagesRef.current;
    const lastMessage = currentMessages[currentMessages.length - 1];
    const ct = contextType as 'GAME' | 'BUG' | 'USER' | 'GROUP';

    if (!lastMessage) {
      if (syncEpochBaselineRef.current === null) syncEpochBaselineRef.current = ep;
      return;
    }

    if (syncEpochBaselineRef.current === null) {
      syncEpochBaselineRef.current = ep;
      if (lastSyncRequired) {
        socketService.syncMessages(ct, id, lastMessage.id);
      }
      return;
    }

    const prevEp = syncEpochBaselineRef.current;
    syncEpochBaselineRef.current = ep;
    const extra = ep - prevEp;
    if (extra > 0) {
      for (let i = 0; i < extra; i++) {
        socketService.syncMessages(ct, id, lastMessage.id);
      }
      return;
    }

    if (lastSyncRequired) {
      socketService.syncMessages(ct, id, lastMessage.id);
    }
  }, [syncRequiredEpoch, lastSyncRequired, contextType, id, messagesRef]);

  useEffect(() => {
    if (!id) return;
    const onStale = (ev: Event) => {
      const d = (ev as CustomEvent<ChatSyncStaleDetail>).detail;
      if (!d || d.contextType !== contextType || d.contextId !== id) return;
      logChatSyncStale(contextType, id);

      const applyStaleRefresh = () => {
        const painted =
          currentIdRef.current === id &&
          messagesRef.current.length > 0 &&
          snapshotRevision > 0;
        if (d.reason === 'threadInvalidated' || !painted) {
          if (shouldDeferOpenReload()) {
            window.setTimeout(applyStaleRefresh, 50);
            return;
          }
          void reloadMessagesFirstPage();
          return;
        }
        const threadKey = chatSyncTailKey(
          contextType,
          id,
          contextType === 'GAME' ? effectiveChatType : undefined
        );
        void reconcileAfterPaint({
          threadKey,
          contextType,
          contextId: id,
          gameChatType: effectiveChatType,
          currentIdRef,
          messagesRef,
          setMessages,
        });
      };

      if (useChatSyncStore.getState().isOpenSyncing) {
        scheduleChatOpenIdle(() => {
          if (useChatSyncStore.getState().isOpenSyncing) return;
          applyStaleRefresh();
        });
        return;
      }
      applyStaleRefresh();
    };
    window.addEventListener(BANDEJA_CHAT_SYNC_STALE, onStale);
    return () => window.removeEventListener(BANDEJA_CHAT_SYNC_STALE, onStale);
  }, [
    id,
    contextType,
    effectiveChatType,
    reloadMessagesFirstPage,
    snapshotRevision,
    currentIdRef,
    messagesRef,
    setMessages,
  ]);

  useEffect(() => {
    if (!id) return;
    const onReadBatch = (ev: Event) => {
      const d = (ev as CustomEvent<ChatReadBatchAppliedDetail>).detail;
      if (!d || d.contextType !== contextType || d.contextId !== id) return;
      if (currentIdRef.current !== id) return;
      setMessages((prev) => {
        const { next, changed } = applySyncReadBatchToMessages(prev, d.userId, d.readAt, d.messageIds);
        if (!changed) return prev;
        messagesRef.current = next;
        return next;
      });
    };
    window.addEventListener(BANDEJA_CHAT_READ_BATCH_APPLIED, onReadBatch);
    return () => window.removeEventListener(BANDEJA_CHAT_READ_BATCH_APPLIED, onReadBatch);
  }, [id, contextType, setMessages, messagesRef, currentIdRef]);
}
