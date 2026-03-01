import { useState, useCallback } from 'react';
import { chatApi, type ChatMessage, type ChatMessageWithStatus } from '@/api/chat';
import type { Poll } from '@/api/chat';
import { usePlayersStore } from '@/store/playersStore';

export interface UseGameChatReactionsParams {
  id: string | undefined;
  user: { id: string } | null;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageWithStatus[]>>;
  messagesRef: React.MutableRefObject<ChatMessageWithStatus[]>;
  setUserChat: React.Dispatch<React.SetStateAction<import('@/api/chat').UserChat | null>>;
}

export function useGameChatReactions({ id, user, setMessages, messagesRef, setUserChat }: UseGameChatReactionsParams) {
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);

  const handleAddReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!user?.id) return;
      const optimisticReaction = {
        id: `pending-${Date.now()}`,
        messageId,
        userId: user.id,
        emoji,
        createdAt: new Date().toISOString(),
        user: user as import('@/types').BasicUser,
        _pending: true as const,
      };
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.id === messageId ? { ...m, reactions: [...m.reactions.filter((r) => r.userId !== user.id), optimisticReaction] } : m
        );
        messagesRef.current = next;
        return next;
      });
      try {
        const reaction = await chatApi.addReaction(messageId, { emoji });
        setMessages((prev) => {
          const next = prev.map((m) =>
            m.id === messageId ? { ...m, reactions: [...m.reactions.filter((r) => r.userId !== reaction.userId), reaction] } : m
          );
          messagesRef.current = next;
          return next;
        });
      } catch (error) {
        console.error('Failed to add reaction:', error);
        setMessages((prev) => {
          const next = prev.map((m) =>
            m.id === messageId ? { ...m, reactions: m.reactions.filter((r) => !(r.userId === user.id && (r as { _pending?: boolean })._pending)) } : m
          );
          messagesRef.current = next;
          return next;
        });
      }
    },
    [user, setMessages, messagesRef]
  );

  const handleRemoveReaction = useCallback(
    async (messageId: string) => {
      if (!user?.id) return;
      const message = messagesRef.current.find((m) => m.id === messageId);
      const removedReactions = message?.reactions.filter((r) => r.userId === user.id) ?? [];
      setMessages((prev) => {
        const next = prev.map((m) => (m.id === messageId ? { ...m, reactions: m.reactions.filter((r) => r.userId !== user.id) } : m));
        messagesRef.current = next;
        return next;
      });
      try {
        await chatApi.removeReaction(messageId);
      } catch (error) {
        console.error('Failed to remove reaction:', error);
        setMessages((prev) => {
          const next = prev.map((m) => (m.id === messageId ? { ...m, reactions: [...m.reactions, ...removedReactions] } : m));
          messagesRef.current = next;
          return next;
        });
      }
    },
    [user?.id, setMessages, messagesRef]
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
      try {
        setMessages((prevMessages) => {
          const newMessages = prevMessages.filter((m) => m.id !== messageId);
          messagesRef.current = newMessages;
          return newMessages;
        });
        await chatApi.deleteMessage(messageId);
      } catch (error) {
        console.error('Failed to delete message:', error);
      }
    },
    [setMessages, messagesRef]
  );

  const handleReplyMessage = useCallback((message: ChatMessage) => setReplyTo(message), []);
  const handleCancelReply = useCallback(() => setReplyTo(null), []);
  const handleEditMessage = useCallback((message: ChatMessage) => setEditingMessage(message), []);
  const handleCancelEdit = useCallback(() => setEditingMessage(null), []);

  const handleMessageUpdated = useCallback(
    (updated: ChatMessage) => {
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
