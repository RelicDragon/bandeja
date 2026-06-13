import { useCallback, useEffect, useState } from 'react';
import { booktimeApi, type BooktimeLinkedGame } from '@/api/booktime';

export function useBooktimeLinkedGames(externalBookingId: string | null | undefined, enabled = true) {
  const [linkedGames, setLinkedGames] = useState<BooktimeLinkedGame[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled || !externalBookingId) {
      setLinkedGames([]);
      return;
    }
    setLoading(true);
    try {
      const res = await booktimeApi.getLinkedGames(externalBookingId);
      setLinkedGames(res.data ?? []);
    } catch {
      setLinkedGames([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, externalBookingId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { linkedGames, loading, reload };
}
