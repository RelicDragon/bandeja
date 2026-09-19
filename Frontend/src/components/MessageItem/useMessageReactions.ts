import { useCallback, useMemo } from 'react';
import { ChatMessage } from '@/api/chat';

interface UseMessageReactionsArgs {
  message: ChatMessage;
  currentUserId: string | undefined;
  replyCount: number;
  isOffline: boolean;
  onScrollToFirstReply?: (parentMessageId: string) => void;
}

const NO_REACTION_COUNTS: Record<string, number> = {};

/**
 * Values, not getters. The previous getter form rebuilt the reaction-count object on every call
 * (twice per row render), so the reaction strip could never memoise on it.
 */
export function useMessageReactions({
  message,
  currentUserId,
  replyCount,
  isOffline,
  onScrollToFirstReply,
}: UseMessageReactionsArgs) {
  const reactions = message.reactions;

  const ownReaction = useMemo(
    () => reactions.find((r) => r.userId === currentUserId),
    [reactions, currentUserId]
  );

  const currentUserReaction = ownReaction?.emoji;
  const isReactionPending = !!(ownReaction && (ownReaction as { _pending?: boolean })._pending);

  const reactionCounts = useMemo(() => {
    if (reactions.length === 0) return NO_REACTION_COUNTS;
    const counts: Record<string, number> = {};
    for (const reaction of reactions) {
      counts[reaction.emoji] = (counts[reaction.emoji] || 0) + 1;
    }
    return counts;
  }, [reactions]);

  const hasReplies = !isOffline && replyCount > 0;

  const handleScrollToReplies = useCallback(() => {
    if (onScrollToFirstReply && !isOffline && replyCount > 0) {
      onScrollToFirstReply(message.id);
    }
  }, [message.id, replyCount, isOffline, onScrollToFirstReply]);

  return {
    currentUserReaction,
    isReactionPending,
    reactionCounts,
    replyCount,
    hasReplies,
    handleScrollToReplies,
  };
}
