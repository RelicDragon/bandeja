import { useCallback } from 'react';
import { ChatMessage } from '@/api/chat';

interface UseMessageReactionsArgs {
  message: ChatMessage;
  currentUserId: string | undefined;
  allMessages: ChatMessage[];
  isOffline: boolean;
  onScrollToMessage?: (messageId: string) => void;
}

export function useMessageReactions({
  message,
  currentUserId,
  allMessages,
  isOffline,
  onScrollToMessage,
}: UseMessageReactionsArgs) {
  const getCurrentUserReaction = useCallback(() => {
    return message.reactions.find(r => r.userId === currentUserId)?.emoji;
  }, [message.reactions, currentUserId]);

  const isReactionPending = useCallback(() => {
    const r = message.reactions.find(r => r.userId === currentUserId);
    return !!(r && (r as { _pending?: boolean })._pending);
  }, [message.reactions, currentUserId]);

  const getReactionCounts = useCallback(() => {
    const counts: { [emoji: string]: number } = {};
    message.reactions.forEach(reaction => {
      counts[reaction.emoji] = (counts[reaction.emoji] || 0) + 1;
    });
    return counts;
  }, [message.reactions]);

  const getReplyCount = useCallback(() => {
    return allMessages.filter(msg => msg.replyToId === message.id).length;
  }, [allMessages, message.id]);

  const hasReplies = useCallback(() => {
    if (isOffline) return false;
    return allMessages.filter(msg => msg.replyToId === message.id).length > 0;
  }, [allMessages, message.id, isOffline]);

  const handleScrollToReplies = useCallback(() => {
    if (onScrollToMessage && !isOffline) {
      const replies = allMessages.filter(msg => msg.replyToId === message.id);
      if (replies.length > 0) {
        onScrollToMessage(replies[0].id);
      }
    }
  }, [allMessages, message.id, isOffline, onScrollToMessage]);

  return {
    getCurrentUserReaction,
    isReactionPending,
    getReactionCounts,
    getReplyCount,
    hasReplies,
    handleScrollToReplies,
  };
}
