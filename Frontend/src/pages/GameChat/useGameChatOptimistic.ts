import { useCallback, useRef, startTransition } from 'react';
import { type ChatMessage, type ChatMessageWithStatus, type OptimisticMessagePayload } from '@/api/chat';
import type { ChatContextType } from '@/api/chat';
import type { ChatType } from '@/types';
import { messageQueueStorage } from '@/services/chatMessageQueueStorage';
import { sendWithTimeout, cancelSend, resend } from '@/services/chatSendService';
import { normalizeChatType } from '@/utils/chatType';
import { parseSystemMessage } from '@/utils/systemMessages';
import { usePlayersStore } from '@/store/playersStore';
import { useChatSyncStore } from '@/store/chatSyncStore';

export interface UseGameChatOptimisticParams {
  id: string | undefined;
  contextType: ChatContextType;
  currentChatType: ChatType;
  user: { id: string } | null;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageWithStatus[]>>;
  messagesRef: React.MutableRefObject<ChatMessageWithStatus[]>;
  scrollToBottom: () => void;
  setUserChat: React.Dispatch<React.SetStateAction<import('@/api/chat').UserChat | null>>;
}

export function useGameChatOptimistic({
  id,
  contextType,
  currentChatType,
  user,
  setMessages,
  messagesRef,
  scrollToBottom,
  setUserChat,
}: UseGameChatOptimisticParams) {
  const handleNewMessageRef = useRef<(message: ChatMessage) => string | void>(() => {});

  const handleAddOptimisticMessage = useCallback(
    (payload: OptimisticMessagePayload): string => {
      if (!id) return '';
      const tempId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        replyToId: payload.replyToId,
        replyTo: payload.replyTo,
        sender: user ? (user as import('@/types').BasicUser) : null,
        reactions: [],
        readReceipts: [],
        _status: 'SENDING',
        _optimisticId: tempId,
      };
      startTransition(() => {
        setMessages((prev) => {
          const next = [...prev, optimistic];
          messagesRef.current = next;
          return next;
        });
      });
      messageQueueStorage.add({
        tempId,
        contextType,
        contextId: id,
        payload,
        createdAt: optimistic.createdAt,
        status: 'queued',
      }).catch((err) => console.error('[messageQueue] add', err));
      requestAnimationFrame(() => requestAnimationFrame(scrollToBottom));
      return tempId;
    },
    [contextType, id, user, scrollToBottom, setMessages, messagesRef]
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

  const handleSendQueued = useCallback(
    (params: {
      tempId: string;
      contextType: ChatContextType;
      contextId: string;
      payload: OptimisticMessagePayload;
      mediaUrls?: string[];
      thumbnailUrls?: string[];
    }) => {
      if (params.contextId !== id) return;
      sendWithTimeout(params, {
        onFailed: handleMarkFailed,
        onSuccess: (created) => handleNewMessageRef.current?.(created),
      });
    },
    [id, handleMarkFailed]
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
        onSuccess: (created) => handleNewMessageRef.current?.(created),
      }).catch((err) => console.error('[messageQueue] resend', err));
    },
    [id, contextType, handleMarkFailed, setMessages, messagesRef]
  );

  const handleRemoveFromQueue = useCallback(
    (tempId: string) => {
      setMessages((prev) => {
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

  const handleReplaceOptimisticWithServerMessage = useCallback(
    (optimisticId: string, serverMessage: ChatMessage) => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => (m as ChatMessageWithStatus)._optimisticId === optimisticId);
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = { ...serverMessage, _optimisticId: optimisticId } as ChatMessageWithStatus;
        messagesRef.current = next;
        return next;
      });
      if (id) {
        messageQueueStorage.remove(optimisticId, contextType, id).catch((err) => console.error('[messageQueue] remove', err));
      }
      cancelSend(optimisticId);
    },
    [contextType, id, setMessages, messagesRef]
  );

  const handleNewMessage = useCallback(
    (message: ChatMessage): string | void => {
      const normalizedCurrentChatType = normalizeChatType(currentChatType);
      const normalizedMessageChatType = normalizeChatType(message.chatType);
      const matchesChatType = contextType === 'USER' || normalizedMessageChatType === normalizedCurrentChatType;
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

      let replacedOptimisticId: string | undefined;
      setMessages((prevMessages) => {
        const exists = prevMessages.some((msg) => msg.id === message.id);
        if (exists) return prevMessages;

        const isOwnServerMessage = message.senderId === user?.id;
        if (isOwnServerMessage) {
          const msgReplyToId = message.replyToId ?? null;
          const msgMentionIds = message.mentionIds?.slice().sort() ?? [];
          const idx = prevMessages.findIndex((m): m is ChatMessageWithStatus => {
            const status = (m as ChatMessageWithStatus)._status;
            if (status !== 'SENDING' && status !== 'FAILED') return false;
            if (m.content !== message.content || m.senderId !== message.senderId) return false;
            if (normalizeChatType(m.chatType) !== normalizedMessageChatType) return false;
            const mReply = m.replyToId ?? null;
            if (mReply !== msgReplyToId) return false;
            const mIds = (m.mentionIds?.slice().sort() ?? []) as string[];
            if (mIds.length !== msgMentionIds.length || mIds.some((id, i) => id !== msgMentionIds[i])) return false;
            return true;
          });
          if (idx >= 0) {
            replacedOptimisticId = (prevMessages[idx] as ChatMessageWithStatus)._optimisticId;
            const next = [...prevMessages];
            next[idx] = { ...message, _optimisticId: replacedOptimisticId } as ChatMessageWithStatus;
            messagesRef.current = next;
            return next;
          }
        }

        const newMessages = [...prevMessages, message as ChatMessageWithStatus];
        messagesRef.current = newMessages;
        return newMessages;
      });

      if (id) useChatSyncStore.getState().setLastMessageId(contextType, id, message.id);

      if (replacedOptimisticId && id) {
        messageQueueStorage.remove(replacedOptimisticId, contextType, id).catch((err) => console.error('[messageQueue] remove', err));
        cancelSend(replacedOptimisticId);
        return replacedOptimisticId;
      }
    },
    [contextType, currentChatType, id, user?.id, setUserChat, setMessages, messagesRef]
  );
  handleNewMessageRef.current = handleNewMessage;

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
