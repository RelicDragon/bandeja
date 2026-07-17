import { useCallback, useEffect, useRef, useState } from 'react';
import { searchGiphy, type GiphySearchItem, type GiphySearchPage } from '@/api/giphy';

const DEBOUNCE_MS = 280;
const PAGE_SIZE = 24;

type UseGiphySearchResult = {
  query: string;
  setQuery: (q: string) => void;
  items: GiphySearchItem[];
  loading: boolean;
  loadingMore: boolean;
  loadMoreError: boolean;
  error: 'unavailable' | 'failed' | 'rateLimited' | null;
  hasMore: boolean;
  loadMore: () => void;
  retryLoadMore: () => void;
  refresh: () => void;
};

function mapError(err: unknown): 'unavailable' | 'failed' | 'rateLimited' {
  if (!err || typeof err !== 'object') return 'failed';
  const status = (err as { response?: { status?: number; data?: { code?: string } } }).response
    ?.status;
  const code = (err as { response?: { data?: { code?: string } } }).response?.data?.code;
  if (status === 503 || code === 'giphy.searchUnavailable') return 'unavailable';
  if (status === 429 || code === 'giphy.searchRateLimited') return 'rateLimited';
  return 'failed';
}

export function useGiphySearch(open: boolean): UseGiphySearchResult {
  const [query, setQueryState] = useState('');
  const [items, setItems] = useState<GiphySearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [error, setError] = useState<'unavailable' | 'failed' | 'rateLimited' | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const requestIdRef = useRef(0);
  const debouncedQueryRef = useRef('');

  const fetchPage = useCallback(async (q: string, offset: number, append: boolean) => {
    const reqId = ++requestIdRef.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setLoadMoreError(false);
    setError(null);
    try {
      const page: GiphySearchPage = await searchGiphy(q, { offset, limit: PAGE_SIZE });
      if (reqId !== requestIdRef.current) return;
      setItems((prev) => (append ? [...prev, ...page.items] : page.items));
      setNextOffset(page.nextOffset ?? offset + (page.limit || page.items.length));
      setHasMore(page.hasMore);
    } catch (err) {
      if (reqId !== requestIdRef.current) return;
      setError(mapError(err));
      if (append) {
        setLoadMoreError(true);
        setHasMore(false);
      } else {
        setItems([]);
        setHasMore(false);
        setNextOffset(0);
      }
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!open) {
      requestIdRef.current += 1;
      setQueryState('');
      setItems([]);
      setError(null);
      setHasMore(false);
      setNextOffset(0);
      setLoading(false);
      setLoadingMore(false);
      setLoadMoreError(false);
      debouncedQueryRef.current = '';
      return;
    }

    // Instant trending when query empty; debounce only typed searches.
    const delay = query.trim() === '' ? 0 : DEBOUNCE_MS;
    const handle = window.setTimeout(() => {
      debouncedQueryRef.current = query;
      void fetchPage(query, 0, false);
    }, delay);
    return () => window.clearTimeout(handle);
  }, [open, query, fetchPage]);

  const setQuery = useCallback((value: string) => {
    requestIdRef.current += 1;
    setQueryState(value);
    setItems([]);
    setError(null);
    setHasMore(false);
    setLoadMoreError(false);
    setLoading(value.trim().length > 0);
  }, []);

  const loadMore = useCallback(() => {
    if (!open || loading || loadingMore || !hasMore) return;
    void fetchPage(debouncedQueryRef.current, nextOffset, true);
  }, [open, loading, loadingMore, hasMore, nextOffset, fetchPage]);

  const refresh = useCallback(() => {
    if (!open) return;
    void fetchPage(query, 0, false);
  }, [open, query, fetchPage]);

  const retryLoadMore = useCallback(() => {
    if (!open || loading || loadingMore) return;
    void fetchPage(debouncedQueryRef.current, nextOffset, true);
  }, [open, loading, loadingMore, nextOffset, fetchPage]);

  return {
    query,
    setQuery,
    items,
    loading,
    loadingMore,
    loadMoreError,
    error,
    hasMore,
    loadMore,
    retryLoadMore,
    refresh,
  };
}
