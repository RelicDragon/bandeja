import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { chatApi, type ChatMessage, type ChatMessageWithStatus, type ChatContextType, type Poll } from '@/api/chat';
import { usePlayersStore } from '@/store/playersStore';
import { shouldQueueChatMutation, isRetryableMutationError } from '@/services/chat/chatMutationNetwork';
import { OfflineIntent } from '@/services/chat/offlineIntent';
import { putLocalMessage } from '@/services/chat/chatLocalApply';
import { useReactionEmojiUsageStore } from '@/store/reactionEmojiUsageStore';
import {
  reduceThreadLiveSnapshot,
  type ThreadLiveConfig,
  type ThreadLiveEvent,
} from '@/services/chat/threadLiveProjection';

export interface UseThreadReactionsParams {
  id: string | undefined;
  contextType: ChatContextType;
  effectiveChatType: import('@/types').ChatType;
  user: { id: string } | null;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageWithStatus[]>>;
  messagesRef: React.MutableRefObject<ChatMessageWithStatus[]>;
  setUserChat: React.Dispatch<React.SetStateAction<import('@/api/chat').UserChat | null>>;
}

function isQueuedSendMessageId(messageId: string): boolean {
  return messageId.startsWith('opt-');
}

export function useThreadReactions({
  id,
  contextType,
  effectiveChatType,
  user,
  setMessages,
  messagesRef,
  setUserChat,
}: UseThreadReactionsParams) {
  const { t } = useTranslation();
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);

  const applyLiveEvent = useCallback(
    (event: ThreadLiveEvent): void => {
      if (!id) return;
      const config: ThreadLiveConfig = {
        contextType,
        contextId: id,
        viewerUserId: user?.id ?? '',
        gameChatTypeFilter: contextType === 'GAME' ? effectiveChatType : undefined,
      };
      setMessages((prev) => {
        const result = reduceThreadLiveSnapshot(prev, [event], config);
        if (!result.changed) return prev;
        messagesRef.current = result.next;
        return result.next;
      });
    },
    [contextType, effectiveChatType, id, messagesRef, setMessages, user?.id]
  );

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
      applyLiveEvent({
        type: 'reaction',
        messageId,
        reaction: optimisticReaction,
      });
      if (shouldQueueChatMutation() && id) {
        try {
          await OfflineIntent.enqueue({
            kind: 'reaction_add',
            contextType,
            contextId: id,
            messageId,
            nextReactions,
            emoji,
            userId: user.id,
          });
        } catch (e) {
          console.error('enqueue reaction', e);
          applyLiveEvent({
            type: 'reaction',
            messageId,
            reaction: optimisticReaction,
            removed: true,
          });
        }
        return;
      }
      try {
        const { reaction, emojiUsage } = await chatApi.addReaction(messageId, { emoji });
        useReactionEmojiUsageStore.getState().applyFromMutation(emojiUsage);
        applyLiveEvent({
          type: 'reaction',
          messageId,
          reaction,
        });
      } catch (error) {
        console.error('Failed to add reaction:', error);
        const code = (error as { response?: { data?: { code?: string } } })?.response?.data?.code;
        if (code === 'INVALID_REACTION_EMOJI') {
          toast.error(t('chat.reactions.invalidEmoji', { defaultValue: 'This emoji cannot be used as a reaction.' }));
        }
        if (id && isRetryableMutationError(error)) {
          try {
            await OfflineIntent.enqueue({
              kind: 'reaction_add',
              contextType,
              contextId: id,
              messageId,
              nextReactions,
              emoji,
              userId: user.id,
            });
          } catch (e) {
            console.error('enqueue reaction', e);
            applyLiveEvent({
              type: 'reaction',
              messageId,
              reaction: optimisticReaction,
              removed: true,
            });
          }
          return;
        }
        applyLiveEvent({
          type: 'reaction',
          messageId,
          reaction: optimisticReaction,
          removed: true,
        });
      }
    },
    [user, id, contextType, messagesRef, t, applyLiveEvent]
  );

  const handleRemoveReaction = useCallback(
    async (messageId: string) => {
      if (!user?.id) return;
      if (isQueuedSendMessageId(messageId)) return;
      const message = messagesRef.current.find((m) => m.id === messageId);
      const removedReactions = message?.reactions.filter((r) => r.userId === user.id) ?? [];
      const nextReactions = message?.reactions.filter((r) => r.userId !== user.id) ?? [];
      for (const reaction of removedReactions) {
        applyLiveEvent({ type: 'reaction', messageId, reaction, removed: true });
      }
      if (shouldQueueChatMutation() && id) {
        try {
          await OfflineIntent.enqueue({
            kind: 'reaction_remove',
            contextType,
            contextId: id,
            messageId,
            nextReactions,
            userId: user.id,
          });
        } catch (e) {
          console.error('enqueue reaction remove', e);
          for (const reaction of removedReactions) {
            applyLiveEvent({ type: 'reaction', messageId, reaction });
          }
        }
        return;
      }
      try {
        await chatApi.removeReaction(messageId);
      } catch (error) {
        console.error('Failed to remove reaction:', error);
        if (id && isRetryableMutationError(error)) {
          try {
            await OfflineIntent.enqueue({
              kind: 'reaction_remove',
              contextType,
              contextId: id,
              messageId,
              nextReactions,
              userId: user.id,
            });
          } catch (e) {
            console.error('enqueue reaction remove', e);
            for (const reaction of removedReactions) {
              applyLiveEvent({ type: 'reaction', messageId, reaction });
            }
          }
          return;
        }
        for (const reaction of removedReactions) {
          applyLiveEvent({ type: 'reaction', messageId, reaction });
        }
      }
    },
    [user?.id, id, contextType, messagesRef, applyLiveEvent]
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
        applyLiveEvent({
          type: 'messageDeleted',
          messageId,
          deletedAt: new Date().toISOString(),
        });
        return;
      }
      const removedSnapshot = messagesRef.current.find((m) => m.id === messageId);
      const restoreRemoved = () => {
        if (!removedSnapshot) return;
        applyLiveEvent({
          type: 'hydrateSnapshot',
          messages: [removedSnapshot as ChatMessageWithStatus],
        });
      };
      applyLiveEvent({
        type: 'messageDeleted',
        messageId,
        deletedAt: new Date().toISOString(),
      });
      if (shouldQueueChatMutation() && id) {
        try {
          await OfflineIntent.enqueue({ kind: 'delete', contextType, contextId: id, messageId });
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
            await OfflineIntent.enqueue({ kind: 'delete', contextType, contextId: id, messageId });
          } catch (e) {
            console.error('enqueue delete', e);
            restoreRemoved();
          }
        }
      }
    },
    [id, contextType, messagesRef, applyLiveEvent]
  );

  const handleReplyMessage = useCallback((message: ChatMessage) => setReplyTo(message), []);
  const handleCancelReply = useCallback(() => setReplyTo(null), []);
  const handleEditMessage = useCallback((message: ChatMessage) => setEditingMessage(message), []);
  const handleCancelEdit = useCallback(() => setEditingMessage(null), []);

  const handleMessageUpdated = useCallback(
    (updated: ChatMessage) => {
      void putLocalMessage(updated);
      applyLiveEvent({
        type: 'hydrateSnapshot',
        messages: [updated as ChatMessageWithStatus],
      });
      setEditingMessage(null);
    },
    [applyLiveEvent]
  );

  const handleMessageReaction = useCallback(
    (reaction: any) => {
      applyLiveEvent({
        type: 'reaction',
        messageId: reaction.messageId,
        reaction,
        removed: reaction.action === 'removed',
      });
    },
    [applyLiveEvent]
  );

  const handleReadReceipt = useCallback(
    (readReceipt: import('@/api/chat').MessageReadReceipt) => {
      applyLiveEvent({
        type: 'readReceipt',
        messageId: readReceipt.messageId,
        receipt: readReceipt,
      });
    },
    [applyLiveEvent]
  );

  const handleMessageDeleted = useCallback(
    (data: { messageId: string }) => {
      applyLiveEvent({
        type: 'messageDeleted',
        messageId: data.messageId,
        deletedAt: new Date().toISOString(),
      });
      setEditingMessage((prev) => (prev?.id === data.messageId ? null : prev));
    },
    [applyLiveEvent]
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
