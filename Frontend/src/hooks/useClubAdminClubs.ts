import { useCallback, useEffect, useRef, useState } from 'react';
import { clubAdminApi, ClubAdminClubListItem } from '@/api/clubAdmin';

const PAGE_SIZE = 20;

export function useClubAdminClubs(onForbidden: (e: unknown) => boolean, search?: string) {
  const [items, setItems] = useState<ClubAdminClubListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(false);
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const searchRef = useRef(search ?? '');

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoading(true);
    setError(false);
    try {
      const data = await clubAdminApi.listClubs({
        limit: PAGE_SIZE,
        offset: offsetRef.current,
        q: searchRef.current.trim() || undefined,
      });
      const pageItems = Array.isArray(data.items) ? data.items : [];
      setItems((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        const unique = pageItems.filter((c) => !seen.has(c.id));
        return [...prev, ...unique];
      });
      offsetRef.current += pageItems.length;
      setHasMore(data.hasMore);
      setTotal(data.total);
    } catch (e) {
      if (!onForbidden(e)) setError(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setInitialLoading(false);
    }
  }, [hasMore, onForbidden]);

  const reset = useCallback(() => {
    offsetRef.current = 0;
    setItems([]);
    setTotal(0);
    setHasMore(true);
    setInitialLoading(true);
    setError(false);
  }, []);

  useEffect(() => {
    searchRef.current = search ?? '';
    reset();
  }, [search, reset]);

  useEffect(() => {
    if (items.length === 0 && hasMore && !loadingRef.current) {
      void loadMore();
    }
  }, [items.length, hasMore, loadMore]);

  return { items, total, loading, initialLoading, hasMore, error, loadMore };
}
