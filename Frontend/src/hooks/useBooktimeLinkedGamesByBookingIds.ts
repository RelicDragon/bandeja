import { useCallback, useEffect, useState } from 'react';
import { booktimeApi, type BooktimeLinkedGame } from '@/api/booktime';

export function useBooktimeLinkedGamesByBookingIds(
  bookingIds: string[],
  enabled = true,
) {
  const [linkedGamesByBookingId, setLinkedGamesByBookingId] = useState<
    ReadonlyMap<string, BooktimeLinkedGame[]>
  >(new Map());
  const [loading, setLoading] = useState(false);
  const idsKey = bookingIds.join('|');

  const reload = useCallback(async () => {
    const ids = idsKey ? idsKey.split('|') : [];
    if (!enabled || ids.length === 0) {
      setLinkedGamesByBookingId(new Map());
      return;
    }
    setLoading(true);
    try {
      const entries: [string, BooktimeLinkedGame[]][] = await Promise.all(
        ids.map(async (bookingId): Promise<[string, BooktimeLinkedGame[]]> => {
          try {
            const res = await booktimeApi.getLinkedGames(bookingId);
            return [bookingId, res.data ?? []];
          } catch {
            return [bookingId, []];
          }
        }),
      );
      setLinkedGamesByBookingId(new Map(entries));
    } finally {
      setLoading(false);
    }
  }, [enabled, idsKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { linkedGamesByBookingId, loading, reload };
}
