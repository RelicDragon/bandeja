import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchLinkedGamesByBookingIds } from '@/api/fetchLinkedGamesByBookingIds';
import type { BooktimeLinkedGame } from '@/api/booktime';

export function useBooktimeLinkedGamesByBookingIds(
  bookingIds: string[],
  enabled = true,
) {
  const [linkedGamesByBookingId, setLinkedGamesByBookingId] = useState<
    ReadonlyMap<string, BooktimeLinkedGame[]>
  >(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const idsKey = bookingIds.join('|');
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    const ids = idsKey ? idsKey.split('|') : [];
    const requestId = ++requestIdRef.current;
    if (!enabled || ids.length === 0) {
      if (requestId !== requestIdRef.current) return;
      setLinkedGamesByBookingId(new Map());
      setLoading(false);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const next = await fetchLinkedGamesByBookingIds(ids);
      if (requestId !== requestIdRef.current) return;
      setLinkedGamesByBookingId(next);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setError(true);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [enabled, idsKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { linkedGamesByBookingId, loading, error, reload };
}
