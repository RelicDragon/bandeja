import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  gameCostApi,
  type CostShareMethod,
  type GameCostSummary,
  type OwedSummary,
  type UpdateCostSharesInput,
} from '@/api/gameCost';
import { queryKeys } from './queryKeys';
import { isCostSplitEnabled } from '@/config/featureFlags';

/**
 * PRD 348 — server state for the cost split ledger.
 *
 * Every mutation returns the whole refreshed summary, so the cache is seeded
 * from the response rather than refetched: on a phone the settle sheet must feel
 * instant even on a slow connection.
 *
 * With the feature flag off nothing is rendered and **no request is made**.
 */

export function useGameCostQuery(gameId: string | undefined, enabled = true) {
  return useQuery<GameCostSummary>({
    queryKey: queryKeys.gameCost.shares(gameId ?? ''),
    queryFn: () => gameCostApi.getCostShares(gameId as string),
    enabled: Boolean(gameId) && enabled && isCostSplitEnabled(),
    staleTime: 30_000,
  });
}

export function useOwedSharesQuery(enabled = true) {
  return useQuery<OwedSummary>({
    queryKey: queryKeys.gameCost.owed,
    queryFn: () => gameCostApi.getOwed(),
    enabled: enabled && isCostSplitEnabled(),
    staleTime: 30_000,
  });
}

export function useGameCostMutations(gameId: string) {
  const queryClient = useQueryClient();

  const seed = (summary: GameCostSummary) => {
    queryClient.setQueryData(queryKeys.gameCost.shares(gameId), summary);
    void queryClient.invalidateQueries({ queryKey: queryKeys.gameCost.owed });
  };

  const markPaid = useMutation({
    mutationFn: (method: CostShareMethod) => gameCostApi.markMyShareAsPaid(gameId, method),
    onSuccess: seed,
  });

  const confirm = useMutation({
    mutationFn: (input: { userId: string; confirmed: boolean }) =>
      gameCostApi.confirmShare(gameId, input.userId, input.confirmed),
    onSuccess: seed,
  });

  const update = useMutation({
    mutationFn: (input: UpdateCostSharesInput) => gameCostApi.updateCostShares(gameId, input),
    onSuccess: seed,
  });

  const remind = useMutation({
    mutationFn: () => gameCostApi.remindUnpaid(gameId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.gameCost.shares(gameId) });
    },
  });

  return { markPaid, confirm, update, remind };
}
