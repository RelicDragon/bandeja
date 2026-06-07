import { useCallback } from 'react';
import { ChatMessage } from '@/api/chat';

interface UseMessageReactionsArgs {
  message: ChatMessage;
  currentUserId: string | undefined;
  replyCount: number;
  isOffline: boolean;
  onScrollToFirstReply?: (parentMessageId: string) => void;
}

export function useMessageReactions({
  message,
  currentUserId,
  replyCount,
  isOffline,
  onScrollToFirstReply,
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

  const getReplyCount = useCallback(() => replyCount, [replyCount]);

  const hasReplies = useCallback(() => {
    if (isOffline) return false;
    return replyCount > 0;
  }, [replyCount, isOffline]);

  const handleScrollToReplies = useCallback(() => {
    if (onScrollToFirstReply && !isOffline && replyCount > 0) {
      onScrollToFirstReply(message.id);
    }
  }, [message.id, replyCount, isOffline, onScrollToFirstReply]);

  return {
    getCurrentUserReaction,
    isReactionPending,
    getReactionCounts,
    getReplyCount,
    hasReplies,
    handleScrollToReplies,
  };
}
