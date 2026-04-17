import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { chatApi, type ChatMessage, type ChatMessageWithStatus, type ChatContextType, type Poll } from '@/api/chat';
import { usePlayersStore } from '@/store/playersStore';
import { shouldQueueChatMutation, isRetryableMutationError } from '@/services/chat/chatMutationNetwork';
import {
  enqueueChatMutationReactionAdd,
  enqueueChatMutationReactionRemove,
  enqueueChatMutationDelete,
} from '@/services/chat/chatMutationEnqueue';
import { putLocalMessage } from '@/services/chat/chatLocalApply';
import { compareChatMessagesAscending } from '@/utils/chatMessageSort';
import { useReactionEmojiUsageStore } from '@/store/reactionEmojiUsageStore';

export interface UseGameChatReactionsParams {
  id: string | undefined;
  contextType: ChatContextType;
  user: { id: string } | null;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageWithStatus[]>>;
  messagesRef: React.MutableRefObject<ChatMessageWithStatus[]>;
  setUserChat: React.Dispatch<React.SetStateAction<import('@/api/chat').UserChat | null>>;
}

function isQueuedSendMessageId(messageId: string): boolean {
  return messageId.startsWith('opt-');
}

export function useGameChatReactions({
  id,
  contextType,
  user,
  setMessages,
  messagesRef,
  setUserChat,
}: UseGameChatReactionsParams) {
  const { t } = useTranslation();
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);

  const handleAddReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!user?.id) return;
      if (isQueuedSendMessageId(messageId)) return;
      const optimisticReaction = {
        id: `pending-${Date.now()}`,
        messageId,
        userId: user.id,
        emoji,
        createdAt: new Date().toISOString(),
        user: user as import('@/types').BasicUser,
        _pending: true as const,
      };
      const prevMsg = messagesRef.current.find((m) => m.id === messageId);
      const nextReactions = prevMsg
        ? [...prevMsg.reactions.filter((r) => r.userId !== user.id), optimisticReaction as (typeof prevMsg.reactions)[0]]
        : [];
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.id === messageId ? { ...m, reactions: [...m.reactions.filter((r) => r.userId !== user.id), optimisticReaction] } : m
        );
        messagesRef.current = next;
        return next;
      });
      if (shouldQueueChatMutation() && id) {
        try {
          await enqueueChatMutationReactionAdd({
            contextType,
            contextId: id,
            messageId,
            nextReactions,
            emoji,
            userId: user.id,
          });
        } catch (e) {
          console.error('enqueue reaction', e);
          setMessages((prev) => {
            const next = prev.map((m) =>
              m.id === messageId
                ? {
                    ...m,
                    reactions: m.reactions.filter(
                      (r) => !(r.userId === user.id && (r as { _pending?: boolean })._pending)
                    ),
                  }
                : m
            );
            messagesRef.current = next;
            return next;
          });
        }
        return;
      }
      try {
        const { reaction, emojiUsage } = await chatApi.addReaction(messageId, { emoji });
        useReactionEmojiUsageStore.getState().applyFromMutation(emojiUsage);
        setMessages((prev) => {
          const next = prev.map((m) =>
            m.id === messageId ? { ...m, reactions: [...m.reactions.filter((r) => r.userId !== reaction.userId), reaction] } : m
          );
          messagesRef.current = next;
          return next;
        });
      } catch (error) {
        console.error('Failed to add reaction:', error);
        const code = (error as { response?: { data?: { code?: string } } })?.response?.data?.code;
        if (code === 'INVALID_REACTION_EMOJI') {
          toast.error(t('chat.reactions.invalidEmoji', { defaultValue: 'This emoji cannot be used as a reaction.' }));
        }
        if (id && isRetryableMutationError(error)) {
          try {
            await enqueueChatMutationReactionAdd({
              contextType,
              contextId: id,
              messageId,
              nextReactions,
              emoji,
              userId: user.id,
            });
          } catch (e) {
            console.error('enqueue reaction', e);
            setMessages((prev) => {
              const next = prev.map((m) =>
                m.id === messageId
                  ? {
                      ...m,
                      reactions: m.reactions.filter(
                        (r) => !(r.userId === user.id && (r as { _pending?: boolean })._pending)
                      ),
                    }
                  : m
              );
              messagesRef.current = next;
              return next;
            });
          }
          return;
        }
        setMessages((prev) => {
          const next = prev.map((m) =>
            m.id === messageId ? { ...m, reactions: m.reactions.filter((r) => !(r.userId === user.id && (r as { _pending?: boolean })._pending)) } : m
          );
          messagesRef.current = next;
          return next;
        });
      }
    },
    [user, id, contextType, setMessages, messagesRef, t]
  );

  const handleRemoveReaction = useCallback(
    async (messageId: string) => {
      if (!user?.id) return;
      if (isQueuedSendMessageId(messageId)) return;
      const message = messagesRef.current.find((m) => m.id === messageId);
      const removedReactions = message?.reactions.filter((r) => r.userId === user.id) ?? [];
      const nextReactions = message?.reactions.filter((r) => r.userId !== user.id) ?? [];
      setMessages((prev) => {
        const next = prev.map((m) => (m.id === messageId ? { ...m, reactions: m.reactions.filter((r) => r.userId !== user.id) } : m));
        messagesRef.current = next;
        return next;
      });
      if (shouldQueueChatMutation() && id) {
        try {
          await enqueueChatMutationReactionRemove({
            contextType,
            contextId: id,
            messageId,
            nextReactions,
            userId: user.id,
          });
        } catch (e) {
          console.error('enqueue reaction remove', e);
          setMessages((prev) => {
            const next = prev.map((m) =>
              m.id === messageId ? { ...m, reactions: [...m.reactions, ...removedReactions] } : m
            );
            messagesRef.current = next;
            return next;
          });
        }
        return;
      }
      try {
        await chatApi.removeReaction(messageId);
      } catch (error) {
        console.error('Failed to remove reaction:', error);
        if (id && isRetryableMutationError(error)) {
          try {
            await enqueueChatMutationReactionRemove({
              contextType,
              contextId: id,
              messageId,
              nextReactions,
              userId: user.id,
            });
          } catch (e) {
            console.error('enqueue reaction remove', e);
            setMessages((prev) => {
              const next = prev.map((m) =>
                m.id === messageId ? { ...m, reactions: [...m.reactions, ...removedReactions] } : m
              );
              messagesRef.current = next;
              return next;
            });
          }
          return;
        }
        setMessages((prev) => {
          const next = prev.map((m) => (m.id === messageId ? { ...m, reactions: [...m.reactions, ...removedReactions] } : m));
          messagesRef.current = next;
          return next;
        });
      }
    },
    [user?.id, id, contextType, setMessages, messagesRef]
  );

  const handlePollUpdated = useCallback(
    (messageId: string, updatedPoll: Poll) => {
      setMessages((prev) => {
        const next = prev.map((m) => (m.id === messageId && m.poll ? { ...m, poll: updatedPoll } : m));
        messagesRef.current = next;
        return next;
      });
    },
    [setMessages, messagesRef]
  );

  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      if (isQueuedSendMessageId(messageId)) {
        setMessages((prevMessages) => {
          const newMessages = prevMessages.filter((m) => m.id !== messageId);
          messagesRef.current = newMessages;
          return newMessages;
        });
        return;
      }
      const removedSnapshot = messagesRef.current.find((m) => m.id === messageId);
      const restoreRemoved = () => {
        if (!removedSnapshot) return;
        setMessages((prev) => {
          if (prev.some((m) => m.id === messageId)) return prev;
          const next = [...prev, removedSnapshot as ChatMessageWithStatus].sort(compareChatMessagesAscending);
          messagesRef.current = next;
          return next;
        });
      };
      setMessages((prevMessages) => {
        const newMessages = prevMessages.filter((m) => m.id !== messageId);
        messagesRef.current = newMessages;
        return newMessages;
      });
      if (shouldQueueChatMutation() && id) {
        try {
          await enqueueChatMutationDelete({ contextType, contextId: id, messageId });
        } catch (e) {
          console.error('enqueue delete', e);
          restoreRemoved();
        }
        return;
      }
      try {
        await chatApi.deleteMessage(messageId);
      } catch (error) {
        console.error('Failed to delete message:', error);
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 404) return;
        if (id && isRetryableMutationError(error)) {
          try {
            await enqueueChatMutationDelete({ contextType, contextId: id, messageId });
          } catch (e) {
            console.error('enqueue delete', e);
            restoreRemoved();
          }
        }
      }
    },
    [id, contextType, setMessages, messagesRef]
  );

  const handleReplyMessage = useCallback((message: ChatMessage) => setReplyTo(message), []);
  const handleCancelReply = useCallback(() => setReplyTo(null), []);
  const handleEditMessage = useCallback((message: ChatMessage) => setEditingMessage(message), []);
  const handleCancelEdit = useCallback(() => setEditingMessage(null), []);

  const handleMessageUpdated = useCallback(
    (updated: ChatMessage) => {
      void putLocalMessage(updated);
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === updated.id);
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = { ...updated, _status: prev[idx]._status, _optimisticId: (prev[idx] as ChatMessageWithStatus)._optimisticId } as ChatMessageWithStatus;
        messagesRef.current = next;
        return next;
      });
      setEditingMessage(null);
    },
    [setMessages, messagesRef]
  );

  const handleMessageReaction = useCallback(
    (reaction: any) => {
      if (reaction.action === 'removed') {
        setMessages((prev) => {
          const newMessages = prev.map((message) =>
            message.id === reaction.messageId ? { ...message, reactions: message.reactions.filter((r) => r.userId !== reaction.userId) } : message
          );
          messagesRef.current = newMessages;
          return newMessages;
        });
      } else {
        setMessages((prev) => {
          const newMessages = prev.map((message) => {
            if (message.id !== reaction.messageId) return message;
            const existing = message.reactions.find((r) => r.userId === reaction.userId);
            if (existing) {
              return { ...message, reactions: message.reactions.map((r) => (r.userId === reaction.userId ? { ...r, emoji: reaction.emoji } : r)) };
            }
            return { ...message, reactions: [...message.reactions, reaction] };
          });
          messagesRef.current = newMessages;
          return newMessages;
        });
      }
    },
    [setMessages, messagesRef]
  );

  const handleReadReceipt = useCallback(
    (readReceipt: any) => {
      setMessages((prev) => {
        let changed = false;
        const newMessages = prev.map((message) => {
          if (message.id === readReceipt.messageId) {
            const existing = message.readReceipts.find((r) => r.userId === readReceipt.userId);
            if (!existing) {
              changed = true;
              return { ...message, readReceipts: [...message.readReceipts, readReceipt] };
            }
          }
          return message;
        });
        if (!changed) return prev;
        messagesRef.current = newMessages;
        return newMessages;
      });
    },
    [setMessages, messagesRef]
  );

  const handleMessageDeleted = useCallback(
    (data: { messageId: string }) => {
      setMessages((prev) => {
        const newMessages = prev.filter((m) => m.id !== data.messageId);
        messagesRef.current = newMessages;
        return newMessages;
      });
      setEditingMessage((prev) => (prev?.id === data.messageId ? null : prev));
    },
    [setMessages, messagesRef]
  );

  const handleChatRequestRespond = useCallback(
    async (messageId: string, accepted: boolean) => {
      if (!id) return;
      try {
        const result = await chatApi.respondToChatRequest(id, messageId, accepted);
        setMessages((prev) => {
          const next = prev.map((m) => {
            if (m.id === messageId && m.content) {
              try {
                const parsed = JSON.parse(m.content);
                if (parsed.type === 'USER_CHAT_REQUEST') return { ...m, content: JSON.stringify({ ...parsed, responded: true }) };
              } catch {
                /* ignore invalid JSON */
              }
            }
            return m;
          });
          const exists = next.some((m) => m.id === result.message.id);
          if (!exists) {
            const withNew = [...next, result.message as ChatMessageWithStatus];
            messagesRef.current = withNew;
            return withNew;
          }
          messagesRef.current = next;
          return next;
        });
        if (result.userChat) {
          setUserChat((prev) => (prev ? { ...prev, ...result.userChat! } : result.userChat));
          usePlayersStore.setState((state) => {
            const existing = state.chats[result.userChat!.id];
            const merged = { ...existing, ...result.userChat };
            if (merged.isPinned === undefined && existing?.isPinned !== undefined) merged.isPinned = existing.isPinned;
            return { chats: { ...state.chats, [result.userChat!.id]: merged } };
          });
        }
      } catch (err) {
        console.error('Respond to chat request failed:', err);
      }
    },
    [id, setUserChat, setMessages, messagesRef]
  );

  return {
    replyTo,
    editingMessage,
    setReplyTo,
    setEditingMessage,
    handleAddReaction,
    handleRemoveReaction,
    handlePollUpdated,
    handleDeleteMessage,
    handleReplyMessage,
    handleCancelReply,
    handleEditMessage,
    handleCancelEdit,
    handleMessageUpdated,
    handleMessageReaction,
    handleReadReceipt,
    handleMessageDeleted,
    handleChatRequestRespond,
  };
}
