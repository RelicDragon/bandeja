import { useCallback, useEffect, useState } from 'react';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { gamesApi } from '@/api/games';
import { useAuthStore } from '@/store/authStore';
import { BOOKTIME_DEFAULT_TIMEZONE } from '@shared/booktime/localTime';
import {
  filterLinkableGames,
  sortLinkableGames,
} from './booktimeGameLinkUtils';

export function useBooktimeLinkableGames(booking: BooktimeBookingRecord | null, enabled: boolean) {
  const userId = useAuthStore((s) => s.user?.id);
  const [games, setGames] = useState<ReturnType<typeof sortLinkableGames>>([]);
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
      const res = await gamesApi.getMyGames();
      const filtered = filterLinkableGames(res.data ?? [], userId);
      setGames(sortLinkableGames(filtered, booking, BOOKTIME_DEFAULT_TIMEZONE));
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
