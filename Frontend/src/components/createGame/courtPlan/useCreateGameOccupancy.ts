import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gamesApi } from '@/api';
import type { BookedCourtSlot, Club } from '@/types';
import { createDateFromClubTime } from '@/hooks/useGameTimeDuration';
import { toOccupancyBlocks, type BookedCourtRow } from '@/features/court-reservations';
import type { OccupancyBlock } from '@shared/gameBooking/planReschedule';

const POLL_MS = 20_000;

/**
 * The club's occupancy for one day as planner blocks (`club`, `hold`,
 * `app_game_reserved`, `app_game_planned`) — every court, so the plan can
 * reason about "Any court" slots. A new game has no blocks of its own.
 *
 * When the server is still loading the provider's busy snapshot it asks the
 * caller to refresh it and fetches again once.
 */
export function useCreateGameOccupancy({
  club,
  selectedDate,
  enabled,
  refreshSnapshot,
}: {
  club: Club | undefined;
  selectedDate: Date;
  enabled: boolean;
  refreshSnapshot?: (options?: { force?: boolean }) => Promise<boolean>;
}) {
  const [rows, setRows] = useState<BookedCourtSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const refreshRef = useRef(refreshSnapshot);
  refreshRef.current = refreshSnapshot;
  const clubId = club?.id ?? null;

  const range = useMemo(() => {
    if (!clubId) return null;
    return {
      startDate: createDateFromClubTime(selectedDate, '00:00', club).toISOString(),
      endDate: createDateFromClubTime(selectedDate, '23:59', club).toISOString(),
    };
  }, [clubId, club, selectedDate]);

  const requestRef = useRef(0);
  const fetchRows = useCallback(
    async (background: boolean) => {
      if (!enabled || !clubId || !range) {
        setRows([]);
        return;
      }
      const request = ++requestRef.current;
      if (!background) setLoading(true);
      try {
        let response = await gamesApi.getBookedCourts({ clubId, ...range });
        if (response.isLoadingExternalSlots && refreshRef.current) {
          await refreshRef.current({ force: true });
          if (request !== requestRef.current) return;
          response = await gamesApi.getBookedCourts({ clubId, ...range });
        }
        if (request !== requestRef.current) return;
        setRows(response.data ?? []);
      } catch (error) {
        console.error('Failed to load court occupancy:', error);
        if (request === requestRef.current && !background) setRows([]);
      } finally {
        if (request === requestRef.current && !background) setLoading(false);
      }
    },
    [enabled, clubId, range],
  );

  useEffect(() => {
    void fetchRows(false);
    if (!enabled || !clubId) return;
    const timer = window.setInterval(() => void fetchRows(true), POLL_MS);
    return () => window.clearInterval(timer);
  }, [fetchRows, enabled, clubId]);

  const blocks = useMemo<OccupancyBlock[]>(
    () => toOccupancyBlocks(rows satisfies readonly BookedCourtRow[], ''),
    [rows],
  );

  return { blocks, loading, refetch: () => fetchRows(true) };
}
