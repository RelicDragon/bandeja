import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';
import { myGamesQueryOptions, type MyGamesData } from '@/queries/games/useMyGamesQuery';
import { countPendingInvites } from '@/services/myTabCacheReader';

const selectActionableInviteCount = (data: MyGamesData): number => countPendingInvites(data.invites);

/**
 * Header bell count, derived from the same my-tab query the Home invites section renders,
 * so the badge can never promise an invite the list does not show. Full-game invites are
 * listed but not counted. The store value is only the fallback before that query has data.
 */
export function usePendingInvitesBadgeCount(): number {
  const userId = useAuthStore((s) => s.user?.id);
  const fallback = useHeaderStore((s) => s.pendingInvites);
  // Observer only: `useHeaderInvitesHydration` owns fetching this query.
  const { data } = useQuery({
    ...myGamesQueryOptions(userId, false),
    select: selectActionableInviteCount,
  });
  return data ?? fallback;
}
