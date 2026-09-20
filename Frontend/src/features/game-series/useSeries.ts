import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/queries/queryKeys';
import { isGameSeriesEnabled } from '@/config/featureFlags';
import { seriesApi, type SeriesDetail, type SeriesGameContext } from '@/api/series';
import { releaseGameRoom, retainGameRoom } from '@/services/gameRoomMembership';
import { useSocketEventsStore } from '@/store/socketEventsStore';

/**
 * PRD 345 — data access for the series surfaces.
 *
 * Everything is gated on the feature flag: with the flag off, no query is
 * enabled and no request goes out, so a disabled feature renders nothing
 * rather than an empty shell (CONTRACT §7.7).
 */

const SERIES_STALE_MS = 30_000;

export function useSeriesDetail(seriesId: string | null | undefined) {
  return useQuery<SeriesDetail>({
    queryKey: queryKeys.series.detail(seriesId ?? 'none'),
    queryFn: async () => {
      const response = await seriesApi.getDetail(seriesId as string);
      return response.data.data;
    },
    enabled: Boolean(seriesId) && isGameSeriesEnabled(),
    staleTime: SERIES_STALE_MS,
  });
}

/**
 * Series context for one occurrence: its own label plus the "same time next
 * week?" state. Returns `null` when the game is not part of a series, which is
 * the signal to render nothing at all.
 */
export function useSeriesGameContext(gameId: string | null | undefined, enabled = true) {
  return useQuery<SeriesGameContext | null>({
    queryKey: queryKeys.series.nextPrompt(gameId ?? 'none'),
    queryFn: async () => {
      const response = await seriesApi.getGameContext(gameId as string);
      return response.data.data ?? null;
    },
    enabled: Boolean(gameId) && enabled && isGameSeriesEnabled(),
    staleTime: SERIES_STALE_MS,
  });
}

export function useMySeries(enabled = true) {
  return useQuery({
    queryKey: queryKeys.series.mine,
    queryFn: async () => {
      const response = await seriesApi.listMine();
      return response.data.data;
    },
    enabled: enabled && isGameSeriesEnabled(),
    staleTime: SERIES_STALE_MS,
  });
}

export interface RespondToNextInput {
  /** The **next** occurrence's game id (`SeriesNextPrompt.nextGameId`). */
  nextGameId: string;
  action: 'accept' | 'decline';
  /** The finished occurrence the card is rendered on — its query is refreshed. */
  sourceGameId: string;
  seriesId?: string | null;
}

export function useRespondToNextOccurrence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ nextGameId, action }: RespondToNextInput) => {
      const response = await seriesApi.respondToNext(nextGameId, action);
      return response.data.data;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.series.nextPrompt(variables.sourceGameId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.games.detail(variables.nextGameId),
      });
      if (variables.seriesId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.series.detail(variables.seriesId),
        });
      }
    },
  });
}

/**
 * Live confirmation counts for the organizer strip.
 *
 * Ref-counted room membership (there is no `useGameSocket` hook — see
 * `GameDetailsShell.tsx`): the room is joined for the **next** occurrence,
 * because that is the game the counter is about.
 */
export function useSeriesConfirmationsLive(
  nextGameId: string | null | undefined,
  onUpdate: (payload: { confirmedCount: number; regularCount: number }) => void,
): void {
  const lastEvent = useSocketEventsStore((state) => state.lastGameSeriesConfirmationsUpdated);

  useEffect(() => {
    if (!nextGameId || !isGameSeriesEnabled()) return undefined;
    void retainGameRoom(nextGameId);
    return () => releaseGameRoom(nextGameId);
  }, [nextGameId]);

  useEffect(() => {
    if (!lastEvent || !nextGameId) return;
    if (lastEvent.gameId !== nextGameId) return;
    onUpdate({
      confirmedCount: lastEvent.confirmedCount,
      regularCount: lastEvent.regularCount,
    });
  }, [lastEvent, nextGameId, onUpdate]);
}
