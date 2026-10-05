import { useQuery } from '@tanstack/react-query';
import { pairsApi } from '@/api/pairs';
import { queryKeys } from '@/queries/queryKeys';
import type { Sport } from '@/types';

/** `a,b` in `a < b` order, or `null` without a real second member. */
export function teamPairId(userAId: string, userBId: string | null | undefined): string | null {
  return userBId && userAId !== userBId ? [userAId, userBId].sort().join(',') : null;
}

/**
 * The pair-detail read behind the team page's record, Dynamic Duo progress and
 * rank chip. One query key, so the hero and the record share a single request.
 */
export function useUserTeamPairDetail(userAId: string, userBId: string | null | undefined, sport?: Sport) {
  const pairId = teamPairId(userAId, userBId);
  const query = useQuery({
    queryKey: queryKeys.pairs.detail(pairId ?? '', sport),
    queryFn: () => pairsApi.getPair(pairId!, sport),
    enabled: Boolean(pairId),
    staleTime: 60 * 1000,
  });
  return { pairId, query };
}
