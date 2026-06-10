import { useCallback, useEffect, useState } from 'react';
import { booktimeApi, type BooktimeLinkedGame } from '@/api/booktime';

export function useBooktimeLinkedGame(externalBookingId: string | null | undefined, enabled = true) {
  const [linkedGame, setLinkedGame] = useState<BooktimeLinkedGame | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled || !externalBookingId) {
      setLinkedGame(null);
      return;
    }
    setLoading(true);
    try {
      const res = await booktimeApi.getLinkedGame(externalBookingId);
      setLinkedGame(res.data ?? null);
    } catch {
      setLinkedGame(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, externalBookingId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { linkedGame, loading, reload };
}
