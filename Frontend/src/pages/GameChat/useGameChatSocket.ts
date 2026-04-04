import { useEffect, type RefObject } from 'react';
import { useChatSyncStore } from '@/store/chatSyncStore';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { useNavigationStore } from '@/store/navigationStore';
import { usePlayersStore } from '@/store/playersStore';
import { socketService } from '@/services/socketService';
import type { ChatContextType } from '@/api/chat';
import type { ChatMessageWithStatus } from '@/api/chat';
import {
  markLocalMessageDeleted,
  onSocketSyncSeq,
  patchLocalReadReceipt,
  persistChatMessagesFromApi,
  persistReactionSocketPayload,
  persistSocketInboundMessage,
  persistSocketPollVoteAndSyncSeq,
  persistSocketTranscriptionAndSyncSeq,
} from '@/services/chat/chatLocalApply';
import { patchThreadIndexClearUnread } from '@/services/chat/chatThreadIndex';
import { scrollChatToBottomIfNearBottom } from '@/utils/chatScrollHelpers';
import { compareChatMessagesAscending } from '@/utils/chatMessageSort';
import { chatSyncTailKey } from '@/utils/chatSyncScope';
import { BANDEJA_CHAT_SYNC_STALE, type ChatSyncStaleDetail } from '@/utils/chatSyncStaleEvents';
import type { ChatType } from '@/types';

export interface UseGameChatSocketParams {
  id: string | undefined;
  contextType: ChatContextType;
  effectiveChatType: ChatType;
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
}

export function useGameChatSocket({
  id,
  contextType,
  effectiveChatType,
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
}: UseGameChatSocketParams) {
  const tailKey = id ? chatSyncTailKey(contextType, id, contextType === 'GAME' ? effectiveChatType : undefined) : '';
  const missedForContext = useChatSyncStore((s) => (tailKey ? s.missedMessagesByContext[tailKey] ?? [] : []));

  const lastChatMessage = useSocketEventsStore((s) => s.lastChatMessage);
  const lastChatMessageUpdated = useSocketEventsStore((s) => s.lastChatMessageUpdated);
  const lastChatMessageTranscription = useSocketEventsStore((s) => s.lastChatMessageTranscription);
  const lastChatReaction = useSocketEventsStore((s) => s.lastChatReaction);
  const lastChatReadReceipt = useSocketEventsStore((s) => s.lastChatReadReceipt);
  const lastChatDeleted = useSocketEventsStore((s) => s.lastChatDeleted);
  const lastSyncRequired = useSocketEventsStore((s) => s.lastSyncRequired);
  const lastPollVote = useSocketEventsStore((s) => s.lastPollVote);

  useEffect(() => {
    if (!id) return;
    const setupSocket = async () => {
      await socketService.joinChatRoom(contextType, id);
    };
    setupSocket();
    return () => {
      socketService.leaveChatRoom(contextType, id);
    };
  }, [id, contextType]);

  useEffect(() => {
    if (contextType === 'GROUP' && id) {
      useNavigationStore.getState().setViewingGroupChannelId(id);
      return () => useNavigationStore.getState().setViewingGroupChannelId(null);
    }
    if (contextType === 'USER' && id) {
      useNavigationStore.getState().setViewingUserChatId(id);
      return () => useNavigationStore.getState().setViewingUserChatId(null);
    }
    if (contextType === 'GAME' && id) {
      useNavigationStore.getState().setViewingGameChat(id, effectiveChatType);
      return () => useNavigationStore.getState().setViewingGameChat(null, null);
    }
  }, [contextType, id, effectiveChatType]);

  useEffect(() => {
    if (missedForContext.length === 0 || !id) return;
    const toMerge = useChatSyncStore
      .getState()
      .getAndClearMissed(contextType, id, contextType === 'GAME' ? effectiveChatType : undefined);
    if (toMerge.length === 0) return;
    void persistChatMessagesFromApi(toMerge).catch(() => {});
    void import('@/services/chat/chatSyncScheduler').then((m) =>
      m.enqueueChatSyncPull(contextType, id, m.SYNC_PRIORITY_FOREGROUND)
    );
    setMessages((prev) => {
      const ids = new Set(prev.map((m) => m.id));
      const added = toMerge.filter((m) => !ids.has(m.id));
      if (added.length === 0) return prev;
      const next = [...prev, ...added].sort(compareChatMessagesAscending);
      messagesRef.current = next;
      const lastId = next[next.length - 1]?.id;
      if (lastId) {
        useChatSyncStore
          .getState()
          .setLastMessageId(contextType, id, lastId, contextType === 'GAME' ? effectiveChatType : undefined);
      }
      return next;
    });
    scrollChatToBottomIfNearBottom(chatContainerRef);
  }, [missedForContext.length, contextType, id, effectiveChatType, chatContainerRef, setMessages, messagesRef]);

  useEffect(() => {
    if (!lastChatMessage || lastChatMessage.contextType !== contextType || lastChatMessage.contextId !== id) return;
    void persistSocketInboundMessage(contextType, id, lastChatMessage.message, lastChatMessage.syncSeq).then(() => {
      handleNewMessage(lastChatMessage.message);
    }).catch(() => {});

    if (id) {
      if (contextType === 'USER') {
        usePlayersStore.getState().updateUnreadCount(id, 0);
        void patchThreadIndexClearUnread('USER', id);
      } else if (contextType === 'GROUP') {
        window.dispatchEvent(new CustomEvent('chat-viewing-clear-unread', { detail: { contextType: 'GROUP', contextId: id } }));
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
  }, [lastChatMessage, contextType, id, userId, handleNewMessage]);

  useEffect(() => {
    if (!lastChatReaction || lastChatReaction.contextType !== contextType || lastChatReaction.contextId !== id) return;
    void persistReactionSocketPayload(lastChatReaction.reaction).catch(() => {});
    void onSocketSyncSeq(contextType, id, lastChatReaction.syncSeq).catch(() => {});
    handleMessageReaction(lastChatReaction.reaction);
  }, [lastChatReaction, contextType, id, handleMessageReaction]);

  useEffect(() => {
    if (!lastChatReadReceipt || lastChatReadReceipt.contextType !== contextType || lastChatReadReceipt.contextId !== id) return;
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
  }, [lastChatReadReceipt, contextType, id, handleReadReceipt]);

  useEffect(() => {
    if (!lastChatDeleted || lastChatDeleted.contextType !== contextType || lastChatDeleted.contextId !== id) return;
    void markLocalMessageDeleted(lastChatDeleted.messageId).catch(() => {});
    void onSocketSyncSeq(contextType, id, lastChatDeleted.syncSeq).catch(() => {});
    handleMessageDeleted({ messageId: lastChatDeleted.messageId });
    fetchPinnedMessages();
  }, [lastChatDeleted, contextType, id, handleMessageDeleted, fetchPinnedMessages]);

  useEffect(() => {
    if (!lastChatMessageUpdated || lastChatMessageUpdated.contextType !== contextType || lastChatMessageUpdated.contextId !== id || !lastChatMessageUpdated.message) return;
    void persistSocketInboundMessage(contextType, id, lastChatMessageUpdated.message, lastChatMessageUpdated.syncSeq).then(() => {
      handleMessageUpdated(lastChatMessageUpdated.message);
    }).catch(() => {});
  }, [lastChatMessageUpdated, contextType, id, handleMessageUpdated]);

  useEffect(() => {
    if (
      !lastChatMessageTranscription ||
      lastChatMessageTranscription.contextType !== contextType ||
      lastChatMessageTranscription.contextId !== id
    ) {
      return;
    }
    const { messageId, audioTranscription, syncSeq } = lastChatMessageTranscription;
    void persistSocketTranscriptionAndSyncSeq(contextType, id, messageId, audioTranscription, syncSeq).catch(() => {});
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === messageId);
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], audioTranscription };
      messagesRef.current = next;
      return next;
    });
  }, [lastChatMessageTranscription, contextType, id, setMessages, messagesRef]);

  useEffect(() => {
    if (!lastSyncRequired || !id) return;
    const currentMessages = messagesRef.current;
    if (currentMessages.length > 0) {
      const lastMessage = currentMessages[currentMessages.length - 1];
      socketService.syncMessages(contextType as 'GAME' | 'BUG' | 'USER' | 'GROUP', id, lastMessage.id);
    }
  }, [lastSyncRequired, contextType, id, messagesRef]);

  useEffect(() => {
    if (!lastPollVote || lastPollVote.contextType !== contextType || lastPollVote.contextId !== id) return;
    void persistSocketPollVoteAndSyncSeq(
      contextType,
      id,
      lastPollVote.messageId,
      lastPollVote.updatedPoll,
      lastPollVote.syncSeq
    ).catch(() => {});
    setMessages((prevMessages) => {
      const newMessages = prevMessages.map((message) => {
        if (message.id === lastPollVote.messageId && message.poll) {
          return { ...message, poll: lastPollVote.updatedPoll };
        }
        return message;
      });
      messagesRef.current = newMessages;
      return newMessages;
    });
  }, [lastPollVote, contextType, id, setMessages, messagesRef]);

  useEffect(() => {
    if (!id) return;
    const onStale = (ev: Event) => {
      const d = (ev as CustomEvent<ChatSyncStaleDetail>).detail;
      if (!d || d.contextType !== contextType || d.contextId !== id) return;
      void reloadMessagesFirstPage();
    };
    window.addEventListener(BANDEJA_CHAT_SYNC_STALE, onStale);
    return () => window.removeEventListener(BANDEJA_CHAT_SYNC_STALE, onStale);
  }, [id, contextType, reloadMessagesFirstPage]);

}
