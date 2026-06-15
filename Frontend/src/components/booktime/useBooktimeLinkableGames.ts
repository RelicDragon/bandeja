import { useCallback, useEffect, useState } from 'react';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { booktimeApi } from '@/api/booktime';
import { gamesApi } from '@/api/games';
import { useAuthStore } from '@/store/authStore';
import type { Game } from '@/types';
import {
  filterLinkableGames,
  resolveBooktimeClubTimezone,
  sortLinkableGames,
} from '@/services/gameBooking/linkBookingToGame';

export function useBooktimeLinkableGames(booking: BooktimeBookingRecord | null, enabled: boolean) {
  const userId = useAuthStore((s) => s.user?.id);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled || !booking || !userId) {
      setGames([]);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const [gamesRes, linkedRes] = await Promise.all([
        gamesApi.getMyGames(),
        booktimeApi.getLinkedGames(booking.uuid),
      ]);
      const linkedIds = new Set((linkedRes.data ?? []).map((game) => game.id));
      const filtered = filterLinkableGames(gamesRes.data ?? [], userId).filter(
        (game) => !linkedIds.has(game.id),
      );
      setGames(sortLinkableGames(filtered, booking, resolveBooktimeClubTimezone({})));
    } catch {
      setError(true);
      setGames([]);
    } finally {
      setLoading(false);
    }
  }, [booking, enabled, userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { games, loading, error, reload };
}
