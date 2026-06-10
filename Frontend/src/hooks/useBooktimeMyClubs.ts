import { useCallback, useEffect, useState } from 'react';
import { booktimeApi, type BooktimeMyClubsPayload } from '@/api/booktime';

export function useBooktimeMyClubs(enabled = true) {
  const [data, setData] = useState<BooktimeMyClubsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled) {
      setData(null);
      return null;
    }
    setLoading(true);
    setError(false);
    try {
      const res = await booktimeApi.getMyClubs();
      const payload = res.data ?? { cityBooktimeClubCount: 0, connectedCount: 0, clubs: [] };
      setData(payload);
      return payload;
    } catch {
      setError(true);
      setData(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}
