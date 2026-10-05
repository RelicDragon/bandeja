/**
 * Network reads the game page's Courts card needs beyond the game payload:
 *  - club occupancy around the game window (`GET /games/booked-courts`, own
 *    game dropped by `gameId`) for "Any court" picks and the reschedule plan;
 *  - "which other games use this reservation" (viewer-scoped linked-games
 *    lookup per provider) for `sharedWith`.
 * Both are lazy (`enabled`) and cached with react-query.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '@/api/axios';
import { gamesApi } from '@/api/games';
import type { ApiResponse, Game } from '@/types';
import { parseInstantMs, type IsoInterval } from '@shared/gameBooking/coverageIntervals';
import type { OccupancyBlock, SharedGameRef } from '@shared/gameBooking/planReschedule';
import { toOccupancyBlocks, type BookedCourtRow } from '@/features/court-reservations';
import { buildSharedWith, linkedGamesSlug, type LinkedGameRow } from './gameCourtsModel';

/** How far around the game the occupancy is read (the reschedule sheet drags ±3 h). */
const OCCUPANCY_PAD_MS = 4 * 60 * 60 * 1000;

export const gameCourtsQueryKeys = {
  occupancy: (gameId: string) => ['gameCourts', 'occupancy', gameId] as const,
  sharedWith: (gameId: string) => ['gameCourts', 'sharedWith', gameId] as const,
};

export function occupancyRange(window: IsoInterval | null): { startDate: string; endDate: string } | null {
  const s = window ? parseInstantMs(window.start) : null;
  const e = window ? parseInstantMs(window.end) : null;
  if (s == null || e == null) return null;
  return {
    startDate: new Date(s - OCCUPANCY_PAD_MS).toISOString(),
    endDate: new Date(e + OCCUPANCY_PAD_MS).toISOString(),
  };
}

export function useGameCourtOccupancy(
  gameId: string,
  clubId: string | null | undefined,
  window: IsoInterval | null,
  enabled: boolean,
): { blocks: OccupancyBlock[]; loading: boolean } {
  const range = occupancyRange(window);
  const query = useQuery({
    queryKey: [...gameCourtsQueryKeys.occupancy(gameId), clubId, range?.startDate, range?.endDate],
    enabled: enabled && Boolean(clubId && range),
    staleTime: 30_000,
    queryFn: async () => {
      const res = await gamesApi.getBookedCourts({ clubId: clubId!, ...range! });
      return toOccupancyBlocks((res.data ?? []) as BookedCourtRow[], gameId);
    },
  });
  return useMemo(() => ({ blocks: query.data ?? [], loading: query.isLoading }), [query.data, query.isLoading]);
}

async function fetchLinkedGames(provider: string, externalBookingId: string): Promise<LinkedGameRow[]> {
  const slug = linkedGamesSlug(provider);
  if (!slug) return [];
  const res = await api.get<ApiResponse<LinkedGameRow[]>>(`/${slug}/linked-games/${encodeURIComponent(externalBookingId)}`);
  return res.data.data ?? [];
}

export function useGameSharedWith(
  game: Pick<Game, 'id' | 'linkedBookings'>,
  enabled: boolean,
): Record<string, SharedGameRef[]> {
  const { t } = useTranslation();
  const links = useMemo(() => game.linkedBookings ?? [], [game.linkedBookings]);
  const key = links.map((l) => `${l.externalBookingProvider}:${l.externalBookingId}`).join(',');
  const query = useQuery({
    queryKey: [...gameCourtsQueryKeys.sharedWith(game.id), key],
    enabled: enabled && links.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const map = new Map<string, LinkedGameRow[]>();
      await Promise.all(
        links.map(async (l) => {
          try {
            map.set(l.externalBookingId, await fetchLinkedGames(l.externalBookingProvider, l.externalBookingId));
          } catch {
            map.set(l.externalBookingId, []);
          }
        }),
      );
      return map;
    },
  });
  const fallbackName = t('gameDetails.courts.otherGame');
  return useMemo(
    () => (query.data ? buildSharedWith(links, query.data, game.id, fallbackName) : {}),
    [query.data, links, game.id, fallbackName],
  );
}
