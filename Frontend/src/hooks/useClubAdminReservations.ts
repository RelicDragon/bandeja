import { useCallback, useEffect, useRef, useState } from 'react';
import { clubAdminApi, ClubAdminReservationItem } from '@/api/clubAdmin';

const PAGE_SIZE = 20;

export function useClubAdminReservations(clubId: string | undefined, onForbidden: (e: unknown) => boolean) {
  const [items, setItems] = useState<ClubAdminReservationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(false);
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (!clubId || loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoading(true);
    setError(false);
    try {
      const data = await clubAdminApi.listReservations(clubId, {
        limit: PAGE_SIZE,
        offset: offsetRef.current,
      });
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        const unique = data.items.filter((i) => !seen.has(i.id));
        return [...prev, ...unique];
      });
      offsetRef.current += data.items.length;
      setHasMore(data.hasMore);
    } catch (e) {
      if (!onForbidden(e)) setError(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setInitialLoading(false);
    }
  }, [clubId, hasMore, onForbidden]);

  const reset = useCallback(() => {
    offsetRef.current = 0;
    setItems([]);
    setHasMore(true);
    setInitialLoading(true);
    setError(false);
  }, []);

  useEffect(() => {
    reset();
  }, [clubId, reset]);

  useEffect(() => {
    if (clubId && items.length === 0 && hasMore && !loadingRef.current) {
      void loadMore();
    }
  }, [clubId, items.length, hasMore, loadMore]);

  return { items, loading, initialLoading, hasMore, error, loadMore, reset };
}
