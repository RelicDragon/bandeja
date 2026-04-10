import { useCallback } from 'react';

export function useReactionSummary(reactions: Array<{ userId: string; emoji: string }>, currentUserId: string | undefined) {
  const getCurrentUserReaction = useCallback(() => {
    return reactions.find((r) => r.userId === currentUserId)?.emoji;
  }, [reactions, currentUserId]);

  const getReactionCounts = useCallback(() => {
    const counts: Record<string, number> = {};
    reactions.forEach((reaction) => {
      counts[reaction.emoji] = (counts[reaction.emoji] || 0) + 1;
    });
    return counts;
  }, [reactions]);

  return { getCurrentUserReaction, getReactionCounts };
}
