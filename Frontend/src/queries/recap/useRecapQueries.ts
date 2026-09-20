import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { recapApi, type MonthlyRecapDetail, type MonthlyRecapListResponse } from '@/api/recap';
import { queryKeys } from '@/queries/queryKeys';

/**
 * PRD 353 — recap server state.
 *
 * The list is cheap and drives two surfaces (the Home rail bubble and the
 * Profile row), so it is one query both read. The detail is only fetched when a
 * viewer actually opens, never on Home render.
 */

const RECAP_STALE_MS = 5 * 60 * 1000;

export function useRecapListQuery(enabled: boolean) {
  return useQuery<MonthlyRecapListResponse>({
    queryKey: queryKeys.recap.list(),
    queryFn: () => recapApi.list(),
    enabled,
    staleTime: RECAP_STALE_MS,
  });
}

export function useRecapDetailQuery(monthKey: string | null) {
  return useQuery<MonthlyRecapDetail>({
    queryKey: queryKeys.recap.detail(monthKey ?? 'none'),
    queryFn: () => recapApi.get(monthKey as string),
    enabled: Boolean(monthKey),
    staleTime: RECAP_STALE_MS,
  });
}

/**
 * Marking a recap viewed is what removes the bubble from Home. It is
 * fire-and-forget: a failed call just leaves the bubble for next time, which is
 * far better than blocking the viewer on a network round trip.
 */
export function useMarkRecapViewed() {
  const queryClient = useQueryClient();
  return useCallback(
    (monthKey: string) => {
      queryClient.setQueryData<MonthlyRecapListResponse>(queryKeys.recap.list(), (previous) =>
        previous
          ? {
              recaps: previous.recaps.map((card) =>
                card.monthKey === monthKey && !card.viewedAt
                  ? { ...card, viewedAt: new Date().toISOString() }
                  : card,
              ),
              unviewed: previous.unviewed?.monthKey === monthKey ? null : previous.unviewed,
            }
          : previous,
      );
      void recapApi
        .markViewed(monthKey)
        .catch(() => {
          // Best effort: the next list fetch is authoritative.
        })
        .finally(() => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.recap.list() });
        });
    },
    [queryClient],
  );
}

export function useShareRecapMutation(monthKey: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slideKeys: string[]) => recapApi.share(monthKey as string, slideKeys),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.recap.all });
    },
  });
}

export function useExportRecapMutation(monthKey: string | null) {
  return useMutation({
    mutationFn: () => recapApi.exportCard(monthKey as string),
  });
}
