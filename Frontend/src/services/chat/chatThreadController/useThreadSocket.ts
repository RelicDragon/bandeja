import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useChatSyncStore } from '@/store/chatSyncStore';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { useGameDetailsChromeStore } from '@/components/GameDetails/gameDetailsChromeStore';
import { socketService } from '@/services/socketService';
import type { ChatContextType } from '@/api/chat';
import type { ChatMessageWithStatus } from '@/api/chat';
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
  canFlushLiveSocketEvents,
  reconcileAfterPaint,
  shouldDeferOpenReload,
} from '@/services/chat/threadOpen';
import {
  processChatRoomBatch,
  type ProcessChatRoomBatchCtx,
} from '@/services/chat/chatThreadController/processChatRoomBatch';

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
  /** Bumps when open paint commits — re-flush pending socket batches queued before paint. */
  openPaintGeneration?: number;
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
  openPaintGeneration = 0,
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
    (): ProcessChatRoomBatchCtx => ({
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
      if (!canFlushLiveSocketEvents(tailKey)) {
        scheduleAfterThreadPaint(flush);
        return;
      }
      const batch = takeChatRoomPending(roomKey);
      if (batch.length === 0) return;
      processChatRoomBatch(batch, roomProcessorCtx);
      onAfterSocketBatch?.();
    };
    scheduleAfterThreadPaint(flush);
  }, [
    roomKey,
    id,
    roomPushSeq,
    openPaintGeneration,
    roomProcessorCtx,
    currentIdRef,
    onAfterSocketBatch,
    contextType,
    effectiveChatType,
  ]);

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
