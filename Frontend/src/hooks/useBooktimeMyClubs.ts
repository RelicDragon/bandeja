import { useCallback, useEffect, useState } from 'react';
import { booktimeApi, type BooktimeMyClubsPayload } from '@/api/booktime';
import { useAuthStore } from '@/store/authStore';
import { useMyGamesQuery } from '@/queries/games/useMyGamesQuery';

const EMPTY_BOOKTIME_CLUBS: BooktimeMyClubsPayload = {
  cityBooktimeClubCount: 0,
  connectedCount: 0,
  clubs: [],
};

export function useBooktimeMyClubs(enabled = true) {
  const userId = useAuthStore((s) => s.user?.id);
  const { data: myTabData, isPending: myTabPending } = useMyGamesQuery(userId, {
    enabled: enabled && !!userId,
  });
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
      const payload = res.data ?? EMPTY_BOOKTIME_CLUBS;
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
    if (!enabled) {
      setData(null);
      return;
    }
    if (myTabPending) return;

    const booktimeConnected = myTabData?.booktimeConnected;
    if (booktimeConnected === false) {
      setData(EMPTY_BOOKTIME_CLUBS);
      setError(false);
      setLoading(false);
      return;
    }

    void reload();
  }, [enabled, myTabPending, myTabData?.booktimeConnected, reload]);

  return { data, loading, error, reload };
}
