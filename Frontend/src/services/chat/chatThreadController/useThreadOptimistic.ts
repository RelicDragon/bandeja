import { useCallback, useRef, useEffect } from 'react';
import {
  type ChatMessage,
  type ChatMessageWithStatus,
  type OptimisticMessagePayload,
} from '@/api/chat';
import type { ChatContextType } from '@/api/chat';
import type { ChatType } from '@/types';
import { messageQueueStorage } from '@/services/chatMessageQueueStorage';
import { sendWithTimeout, cancelSend, resend } from '@/services/chatSendService';
import { normalizeChatType } from '@/utils/chatType';
import { parseSystemMessage } from '@/utils/systemMessages';
import {
  STORY_DM_OPTIMISTIC_EVENT,
  STORY_DM_OPTIMISTIC_FAILED_EVENT,
  STORY_DM_SENT_EVENT,
  type StoryDmOptimisticDetail,
} from '@/services/chat/storyDmApply';
import { usePlayersStore } from '@/store/playersStore';
import { applyThreadEvent } from '@/services/chat/chatLocalApplyThreadEvent';
import { donateOutgoingChatIntent } from '@/services/chat/chatIntentDonation';
import {
  CHAT_OUTBOX_FAILED_EVENT,
  CHAT_OUTBOX_REMOVED_EVENT,
  CHAT_OUTBOX_SUCCESS_EVENT,
  type ChatOutboxRemovedDetail,
} from '@/services/chat/chatOutboxEvents';
import { revokeChatBlobUrls } from '@/utils/chatBlobUrls';
import { OfflineIntent } from '@/services/chat/offlineIntent';
import { shouldApplyGameChatMessageDespiteTabMismatch } from '@/pages/GameChat/chatOptimisticMatch';
import {
  reduceThreadLiveSnapshot,
  type ThreadLiveConfig,
  type ThreadLiveEvent,
} from '@/services/chat/threadLiveProjection';

function revokeReconciledOptimisticBlobs(
  prev: readonly ChatMessageWithStatus[],
  replacedIds: readonly string[],
  removedIds: readonly string[]
): void {
  for (const optId of [...replacedIds, ...removedIds]) {
    const row = prev.find((m) => m._optimisticId === optId);
    if (row) revokeChatBlobUrls(row);
  }
}

function findOptimisticMatch(
  messages: readonly ChatMessageWithStatus[],
  message: ChatMessage,
  optimisticIdHint?: string
): ChatMessageWithStatus | undefined {
  const clientMutationId = message.clientMutationId?.trim();
  return messages.find((m) => {
    const optimisticId = m._optimisticId;
    const optimisticClientId = m._clientMutationId?.trim();
    return (
      (optimisticIdHint != null && (optimisticId === optimisticIdHint || m.id === optimisticIdHint)) ||
      (clientMutationId != null && clientMutationId !== '' && optimisticClientId === clientMutationId) ||
      m.id === message.id
    );
  });
}

export interface UseThreadOptimisticParams {
  id: string | undefined;
  contextType: ChatContextType;
  currentChatType: ChatType;
  user: { id: string } | null;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageWithStatus[]>>;
  messagesRef: React.MutableRefObject<ChatMessageWithStatus[]>;
  scrollToBottom: () => void;
  setUserChat: React.Dispatch<React.SetStateAction<import('@/api/chat').UserChat | null>>;
}

export function useThreadOptimistic({
  id,
  contextType,
  currentChatType,
  user,
  setMessages,
  messagesRef,
  scrollToBottom,
  setUserChat,
}: UseThreadOptimisticParams) {
  const handleNewMessageRef = useRef<(message: ChatMessage) => string | void>(() => {});

  const buildLiveConfig = useCallback(
    (gameChatTypeFilter?: ChatType): ThreadLiveConfig | null => {
      if (!id) return null;
      return {
        contextType,
        contextId: id,
        viewerUserId: user?.id ?? '',
        gameChatTypeFilter:
          contextType === 'GAME'
            ? gameChatTypeFilter ?? normalizeChatType(currentChatType)
            : undefined,
      };
    },
    [contextType, currentChatType, id, user?.id]
  );

  const applyLiveEvent = useCallback(
    (
      event: ThreadLiveEvent,
      options: { gameChatTypeFilter?: ChatType } = {}
    ): { changed: boolean; previous: ChatMessageWithStatus[]; next: ChatMessageWithStatus[] } => {
      const config = buildLiveConfig(options.gameChatTypeFilter);
      if (!config) {
        return { changed: false, previous: messagesRef.current, next: messagesRef.current };
      }
      let previousSnapshot = messagesRef.current;
      let nextSnapshot = messagesRef.current;
      let changed = false;
      setMessages((prev) => {
        previousSnapshot = prev;
        const result = reduceThreadLiveSnapshot(prev, [event], config);
        if (!result.changed) {
          nextSnapshot = prev;
          return prev;
        }
        changed = true;
        nextSnapshot = result.next;
        messagesRef.current = result.next;
        return result.next;
      });
      return { changed, previous: previousSnapshot, next: nextSnapshot };
    },
    [buildLiveConfig, messagesRef, setMessages]
  );

  const handleAddOptimisticMessage = useCallback(
    (
      payload: OptimisticMessagePayload,
      pendingImageBlobs?: Blob[],
      pendingVoiceBlob?: Blob,
      pendingVideoBlob?: Blob,
      pendingVideoPosterBlob?: Blob,
      videoTranscodeMs?: number
    ): string => {
      if (!id) return '';
      const tempId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const clientMutationId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 15)}`;
      const optimistic: ChatMessageWithStatus = {
        id: tempId,
        chatContextType: contextType,
        contextId: id,
        senderId: user?.id ?? null,
        content: payload.content,
        mediaUrls: payload.mediaUrls,
        thumbnailUrls: payload.thumbnailUrls,
        mentionIds: payload.mentionIds,
        state: 'SENT',
        chatType: payload.chatType,
        messageType: payload.messageType,
        audioDurationMs: payload.audioDurationMs,
        videoDurationMs: payload.videoDurationMs,
        videoWidth: payload.videoWidth,
        videoHeight: payload.videoHeight,
        waveformData: payload.waveformData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        replyToId: payload.replyToId,
        replyTo: payload.replyTo,
        storyReply: payload.storyReply,
        sender: user ? (user as import('@/types').BasicUser) : null,
        reactions: [],
        readReceipts: [],
        _status: 'SENDING',
        _optimisticId: tempId,
        _clientMutationId: clientMutationId,
      };
      const persistPayload =
        pendingVoiceBlob != null || pendingVideoBlob != null
          ? { ...payload, mediaUrls: [], thumbnailUrls: [] }
          : payload;
      applyLiveEvent({ type: 'optimisticSend', message: optimistic });
      void OfflineIntent.enqueue({
        kind: 'send',
        queued: {
          tempId,
          contextType,
          contextId: id,
          payload: persistPayload,
          createdAt: optimistic.createdAt,
          status: 'queued',
          clientMutationId,
          ...(pendingImageBlobs?.length ? { pendingImageBlobs } : {}),
          ...(pendingVoiceBlob ? { pendingVoiceBlob } : {}),
          ...(pendingVideoBlob
            ? {
                pendingVideoBlob,
                pendingVideoPosterBlob,
                videoDurationMs: payload.videoDurationMs,
                videoTranscodeMs,
              }
            : {}),
        },
      }).catch((err) => console.error('[messageQueue] add', err));
      requestAnimationFrame(() => {
        try {
          scrollToBottom();
        } catch {
          /* scroll handled by MessageList new-message effect */
        }
      });
      return tempId;
    },
    [contextType, id, user, scrollToBottom, applyLiveEvent]
  );

  const handleMarkFailed = useCallback(
    (tempId: string) => {
      setMessages((prev) => {
        const next = prev.map((m) =>
          (m as ChatMessageWithStatus)._optimisticId === tempId ? { ...m, _status: 'FAILED' as const } : m
        );
        messagesRef.current = next;
        return next;
      });
    },
    [setMessages, messagesRef]
  );

  const handleReplaceOptimisticWithServerMessage = useCallback(
    (optimisticId: string, serverMessage: ChatMessage) => {
      const matched = findOptimisticMatch(messagesRef.current, serverMessage, optimisticId);
      const clientId = matched?._optimisticId ?? matched?._clientMutationId ?? optimisticId;
      const result = applyLiveEvent({
        type: 'messageAck',
        clientId,
        message: serverMessage,
      });
      if (result.changed) {
        revokeReconciledOptimisticBlobs(result.previous, [matched?._optimisticId ?? matched?.id ?? optimisticId], []);
      }
      void applyThreadEvent({ kind: 'sendSuccess', message: serverMessage }).catch(() => {});
      donateOutgoingChatIntent(serverMessage);
      if (id) {
        messageQueueStorage.remove(optimisticId, contextType, id).catch((err) => console.error('[messageQueue] remove', err));
      }
      cancelSend(optimisticId);
    },
    [contextType, id, applyLiveEvent, messagesRef]
  );

  const finishQueuedSendSuccess = useCallback(
    (tempId: string, created: ChatMessage) => {
      handleReplaceOptimisticWithServerMessage(tempId, created);
      handleNewMessageRef.current?.(created);
    },
    [handleReplaceOptimisticWithServerMessage]
  );

  const handleSendQueued = useCallback(
    (params: {
      tempId: string;
      contextType: ChatContextType;
      contextId: string;
      payload: OptimisticMessagePayload;
      mediaUrls?: string[];
      thumbnailUrls?: string[];
    }) => {
      const { tempId } = params;
      void (async () => {
        const row = await messageQueueStorage.getByTempId(tempId);
        const contextType = row?.contextType ?? params.contextType;
        const contextId = row?.contextId ?? params.contextId;
        const appliesToOpenThread = contextId === id;
        sendWithTimeout(
          {
            ...params,
            contextType,
            contextId,
            clientMutationId: row?.clientMutationId,
          },
          {
            onFailed: appliesToOpenThread ? handleMarkFailed : () => {},
            onSuccess: appliesToOpenThread
              ? (created) => finishQueuedSendSuccess(tempId, created)
              : undefined,
          }
        );
      })();
    },
    [id, handleMarkFailed, finishQueuedSendSuccess]
  );

  const handleResendQueued = useCallback(
    (tempId: string) => {
      if (!id) return;
      setMessages((prev) => {
        const next = prev.map((m) =>
          (m as ChatMessageWithStatus)._optimisticId === tempId ? { ...m, _status: 'SENDING' as const } : m
        );
        messagesRef.current = next;
        return next;
      });
      resend(tempId, contextType, id, {
        onFailed: handleMarkFailed,
        onSuccess: (created) => finishQueuedSendSuccess(tempId, created),
      }).catch((err) => console.error('[messageQueue] resend', err));
    },
    [id, contextType, handleMarkFailed, setMessages, messagesRef, finishQueuedSendSuccess]
  );

  const handleRemoveFromQueue = useCallback(
    (tempId: string) => {
      setMessages((prev) => {
        const hit = prev.find((m) => (m as ChatMessageWithStatus)._optimisticId === tempId);
        revokeChatBlobUrls(hit ?? undefined);
        const next = prev.filter((m) => (m as ChatMessageWithStatus)._optimisticId !== tempId);
        messagesRef.current = next;
        return next;
      });
      if (id) {
        messageQueueStorage.remove(tempId, contextType, id).catch((err) => console.error('[messageQueue] remove', err));
      }
      cancelSend(tempId);
    },
    [contextType, id, setMessages, messagesRef]
  );

  const handleSendFailed = useCallback(
    (optimisticId: string) => {
      setMessages((prev) => {
        const hit = prev.find((m) => (m as ChatMessageWithStatus)._optimisticId === optimisticId);
        revokeChatBlobUrls(hit ?? undefined);
        const next = prev.filter((m) => (m as ChatMessageWithStatus)._optimisticId !== optimisticId);
        messagesRef.current = next;
        return next;
      });
      if (id) {
        messageQueueStorage.remove(optimisticId, contextType, id).catch((err) => console.error('[messageQueue] remove', err));
        cancelSend(optimisticId);
      }
    },
    [contextType, id, setMessages, messagesRef]
  );

  const handleNewMessage = useCallback(
    (message: ChatMessage): string | void => {
      const normalizedCurrentChatType = normalizeChatType(currentChatType);
      const normalizedMessageChatType = normalizeChatType(message.chatType);
      const bypassGameTabFilter =
        contextType === 'GAME' &&
        shouldApplyGameChatMessageDespiteTabMismatch(
          message,
          user?.id,
          currentChatType,
          messagesRef.current
        );
      const matchesChatType =
        contextType === 'USER' ||
        contextType === 'BUG' ||
        normalizedMessageChatType === normalizedCurrentChatType ||
        bypassGameTabFilter;
      if (!matchesChatType) return;

      if (contextType === 'USER' && id && !message.senderId && message.content) {
        const parsed = parseSystemMessage(message.content);
        if (parsed?.type === 'USER_CHAT_ACCEPTED') {
          const { fetchUserChats, getChatById } = usePlayersStore.getState();
          fetchUserChats().then(() => {
            const updated = getChatById(id!);
            if (updated) setUserChat(updated);
          });
        }
      }

      let effectPack: { replacedOptimisticId?: string; lastMessageId: string } | undefined;
      let shortCircuitDuplicateId = false;
      const pendingMatch = findOptimisticMatch(messagesRef.current, message);

      const projectionResult = applyLiveEvent(
        pendingMatch
          ? {
              type: 'messageAck',
              clientId: pendingMatch._optimisticId ?? pendingMatch._clientMutationId ?? pendingMatch.id,
              message,
            }
          : { type: 'inboundMessage', message },
        {
          gameChatTypeFilter: bypassGameTabFilter ? undefined : normalizedCurrentChatType,
        }
      );

      if (!projectionResult.changed && messagesRef.current.some((msg) => msg.id === message.id)) {
        shortCircuitDuplicateId = true;
      } else if (projectionResult.changed) {
        const replacedOptimisticId = pendingMatch?._optimisticId ?? pendingMatch?.id;
        if (replacedOptimisticId) {
          revokeReconciledOptimisticBlobs(projectionResult.previous, [replacedOptimisticId], []);
        }
        effectPack = { replacedOptimisticId, lastMessageId: message.id };
      }

      if (shortCircuitDuplicateId && id && message.senderId === user?.id) {
        const cid = message.clientMutationId?.trim();
        if (cid) {
          void messageQueueStorage.getByContext(contextType, id).then((rows) => {
            const hit = rows.find((r) => (r.clientMutationId ?? '').trim() === cid);
            if (hit) {
              void messageQueueStorage.remove(hit.tempId, contextType, id).catch((err) =>
                console.error('[messageQueue] remove duplicate message id', err)
              );
              cancelSend(hit.tempId);
            }
          });
        }
      }

      if (effectPack && id) {
        void applyThreadEvent({
          kind: 'uiTailAdvance',
          contextType,
          contextId: id,
          messageId: effectPack.lastMessageId,
          gameChatType: contextType === 'GAME' ? normalizedCurrentChatType : undefined,
        });
      }
      if (effectPack?.replacedOptimisticId && id) {
        messageQueueStorage
          .remove(effectPack.replacedOptimisticId, contextType, id)
          .catch((err) => console.error('[messageQueue] remove', err));
        cancelSend(effectPack.replacedOptimisticId);
        return effectPack.replacedOptimisticId;
      }
    },
    [contextType, currentChatType, id, user?.id, setUserChat, messagesRef, applyLiveEvent]
  );
  handleNewMessageRef.current = handleNewMessage;

  useEffect(() => {
    const onSuccess = (ev: Event) => {
      const d = (ev as CustomEvent<{ tempId?: string; message?: ChatMessage; contextType?: string; contextId?: string }>)
        .detail;
      if (!d?.tempId || !d.message || d.contextType !== contextType || d.contextId !== id) return;
      handleReplaceOptimisticWithServerMessage(d.tempId, d.message);
    };
    const onFail = (ev: Event) => {
      const d = (ev as CustomEvent<{ tempId?: string; contextType?: string; contextId?: string }>).detail;
      if (!d?.tempId || d.contextType !== contextType || d.contextId !== id) return;
      handleMarkFailed(d.tempId);
    };
    const onRemoved = (ev: Event) => {
      const d = (ev as CustomEvent<ChatOutboxRemovedDetail>).detail;
      if (!d?.tempIds?.length || d.contextType !== contextType || d.contextId !== id) return;
      for (const tid of d.tempIds) {
        cancelSend(tid);
      }
      setMessages((prev) => {
        for (const m of prev) {
          const oid = (m as ChatMessageWithStatus)._optimisticId;
          if (oid && d.tempIds!.includes(oid)) revokeChatBlobUrls(m as ChatMessageWithStatus);
        }
        const next = prev.filter((m) => {
          const oid = (m as ChatMessageWithStatus)._optimisticId;
          return !oid || !d.tempIds!.includes(oid);
        });
        messagesRef.current = next;
        return next;
      });
    };
    const onStoryDmSent = (ev: Event) => {
      const d = (
        ev as CustomEvent<{ message?: ChatMessage; contextType?: string; contextId?: string }>
      ).detail;
      if (!d?.message || d.contextType !== contextType || d.contextId !== id) return;
      handleNewMessage(d.message);
    };
    const onStoryDmOptimistic = (ev: Event) => {
      const d = (ev as CustomEvent<StoryDmOptimisticDetail>).detail;
      if (!d?.tempId || d.contextId !== id || contextType !== 'USER') return;
      const optimistic: ChatMessageWithStatus = {
        id: d.tempId,
        chatContextType: 'USER',
        contextId: d.contextId,
        senderId: d.sender.id,
        content: d.content,
        mediaUrls: [],
        thumbnailUrls: [],
        mentionIds: [],
        state: 'SENT',
        chatType: 'PUBLIC',
        storyReply: d.storyReply,
        createdAt: d.createdAt,
        updatedAt: d.createdAt,
        sender: d.sender,
        reactions: [],
        readReceipts: [],
        _status: 'SENDING',
        _optimisticId: d.tempId,
        _clientMutationId: d.clientMutationId,
      };
      if (messagesRef.current.some((m) => (m as ChatMessageWithStatus)._optimisticId === d.tempId)) return;
      applyLiveEvent({ type: 'optimisticSend', message: optimistic });
      requestAnimationFrame(() => {
        try {
          scrollToBottom();
        } catch {
          /* scroll handled by MessageList */
        }
      });
    };
    const onStoryDmOptimisticFailed = (ev: Event) => {
      const d = (
        ev as CustomEvent<{ contextType?: string; contextId?: string; tempId?: string }>
      ).detail;
      if (!d?.tempId || d.contextType !== contextType || d.contextId !== id) return;
      setMessages((prev) => {
        const next = prev.filter((m) => (m as ChatMessageWithStatus)._optimisticId !== d.tempId);
        messagesRef.current = next;
        return next;
      });
    };
    window.addEventListener(CHAT_OUTBOX_SUCCESS_EVENT, onSuccess);
    window.addEventListener(CHAT_OUTBOX_FAILED_EVENT, onFail);
    window.addEventListener(CHAT_OUTBOX_REMOVED_EVENT, onRemoved);
    window.addEventListener(STORY_DM_SENT_EVENT, onStoryDmSent);
    window.addEventListener(STORY_DM_OPTIMISTIC_EVENT, onStoryDmOptimistic);
    window.addEventListener(STORY_DM_OPTIMISTIC_FAILED_EVENT, onStoryDmOptimisticFailed);
    return () => {
      window.removeEventListener(CHAT_OUTBOX_SUCCESS_EVENT, onSuccess);
      window.removeEventListener(CHAT_OUTBOX_FAILED_EVENT, onFail);
      window.removeEventListener(CHAT_OUTBOX_REMOVED_EVENT, onRemoved);
      window.removeEventListener(STORY_DM_SENT_EVENT, onStoryDmSent);
      window.removeEventListener(STORY_DM_OPTIMISTIC_EVENT, onStoryDmOptimistic);
      window.removeEventListener(STORY_DM_OPTIMISTIC_FAILED_EVENT, onStoryDmOptimisticFailed);
    };
  }, [
    contextType,
    id,
    handleNewMessage,
    handleReplaceOptimisticWithServerMessage,
    handleMarkFailed,
    scrollToBottom,
    setMessages,
    messagesRef,
    applyLiveEvent,
  ]);

  return {
    handleAddOptimisticMessage,
    handleMarkFailed,
    handleSendQueued,
    handleResendQueued,
    handleRemoveFromQueue,
    handleSendFailed,
    handleReplaceOptimisticWithServerMessage,
    handleNewMessage,
    handleNewMessageRef,
  };
}
