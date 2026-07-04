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
import type { ChatType } from '@/types';
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
import type { ThreadLiveConfig } from '@/services/chat/threadLiveProjection';
import { canUseLiveThreadIngress } from '@/services/chat/chatThreadLiveIngress';

export interface UseThreadSocketParams {
  id: string | undefined;
  contextType: ChatContextType;
  effectiveChatType: ChatType;
  currentIdRef: RefObject<string | undefined>;
  userId: string | undefined;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageWithStatus[]>>;
  messagesRef: React.MutableRefObject<ChatMessageWithStatus[]>;
  onInboundMessage?: (message: import('@/api/chat').ChatMessage) => void;
  reloadMessagesFirstPage: () => void | Promise<void>;
  onAfterSocketBatch?: () => void;
  /** Bumps when open paint commits — re-flush pending socket batches queued before paint. */
  openPaintGeneration?: number;
  isLoadingContext?: boolean;
  isGameChatArchived?: boolean;
  isGameChatAccessDenied?: boolean;
}

export function useThreadSocket({
  id,
  contextType,
  effectiveChatType,
  currentIdRef,
  userId,
  setMessages,
  messagesRef,
  onInboundMessage,
  reloadMessagesFirstPage,
  onAfterSocketBatch,
  openPaintGeneration = 0,
  isLoadingContext = false,
  isGameChatArchived = false,
  isGameChatAccessDenied = false,
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
  const liveIngressEnabled = canUseLiveThreadIngress({
    contextType,
    isLoadingContext,
    isGameChatArchived,
    isGameChatAccessDenied,
  });
  const roomProcessorCtx = useMemo(
    (): ProcessChatRoomBatchCtx => {
      const threadLiveConfig: ThreadLiveConfig | undefined = id
        ? {
            contextType,
            contextId: id,
            viewerUserId: userId ?? '',
            gameChatTypeFilter: contextType === 'GAME' ? effectiveChatType : undefined,
          }
        : undefined;

      return {
        id,
        contextType,
        effectiveChatType,
        userId,
        setMessages,
        messagesRef,
        onInboundMessage,
        threadLiveConfig: threadLiveConfig!,
      };
    },
    [
      id,
      contextType,
      effectiveChatType,
      userId,
      setMessages,
      messagesRef,
      onInboundMessage,
    ]
  );

  useEffect(() => {
    if (!id || !liveIngressEnabled) return;
    let joined = false;
    let disposed = false;
    const setupSocket = async () => {
      await socketService.joinChatRoom(contextType, id);
      if (disposed) {
        socketService.leaveChatRoom(contextType, id);
        return;
      }
      joined = true;
    };
    void setupSocket();
    return () => {
      disposed = true;
      if (joined) socketService.leaveChatRoom(contextType, id);
    };
  }, [id, contextType, liveIngressEnabled]);

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
    if (!roomKey || !id || !liveIngressEnabled) return;
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
      const batch = useSocketEventsStore.getState().takeChatRoomQueue(roomKey);
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
    liveIngressEnabled,
  ]);

  useEffect(() => {
    syncEpochBaselineRef.current = null;
  }, [id, contextType]);

  useEffect(() => {
    if (!id || !liveIngressEnabled) return;
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
  }, [syncRequiredEpoch, lastSyncRequired, contextType, id, messagesRef, liveIngressEnabled]);

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
}
