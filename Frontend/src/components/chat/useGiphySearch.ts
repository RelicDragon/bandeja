import { useCallback, useEffect, useRef, useState } from 'react';
import { searchGiphy, type GiphySearchItem, type GiphySearchPage } from '@/api/giphy';
import { applyGiphySearchPageItems } from './giphySearchItems';

const DEBOUNCE_MS = 280;
const PAGE_SIZE = 24;
const MAX_RETAINED_ITEMS = 240;

type UseGiphySearchResult = {
  provider: 'GIPHY' | 'KLIPY';
  providers: Array<'GIPHY' | 'KLIPY'>;
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

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; name?: string };
  return (
    e.code === 'ERR_CANCELED' ||
    e.name === 'CanceledError' ||
    e.name === 'AbortError'
  );
}

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
  const [provider, setProvider] = useState<'GIPHY' | 'KLIPY'>('GIPHY');
  const [items, setItems] = useState<GiphySearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [error, setError] = useState<'unavailable' | 'failed' | 'rateLimited' | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const requestIdRef = useRef(0);
  const debouncedQueryRef = useRef('');
  const abortRef = useRef<AbortController | null>(null);
  const itemsRef = useRef<GiphySearchItem[]>([]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      abortRef.current = null;
    },
    []
  );

  const fetchPage = useCallback(async (
    q: string,
    offset: number,
    append: boolean,
    providerHint?: 'GIPHY' | 'KLIPY'
  ) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const reqId = ++requestIdRef.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setLoadMoreError(false);
    setError(null);
    try {
      const page: GiphySearchPage = await searchGiphy(q, {
        offset,
        limit: PAGE_SIZE,
        provider: providerHint,
        signal: controller.signal,
      });
      if (reqId !== requestIdRef.current) return;
      const nextItems = applyGiphySearchPageItems(
        itemsRef.current,
        page.items,
        append
      ).slice(0, MAX_RETAINED_ITEMS);
      itemsRef.current = nextItems;
      setItems(nextItems);
      setProvider(page.provider);
      setNextOffset(page.nextOffset ?? offset + (page.limit || page.items.length));
      setHasMore(page.hasMore && nextItems.length < MAX_RETAINED_ITEMS);
    } catch (err) {
      if (reqId !== requestIdRef.current) return;
      if (isAbortError(err) || controller.signal.aborted) return;
      setError(mapError(err));
      if (append) {
        setLoadMoreError(true);
        setHasMore(false);
      } else {
        itemsRef.current = [];
        setItems([]);
        setHasMore(false);
        setNextOffset(0);
      }
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      requestIdRef.current += 1;
      setQueryState('');
      setProvider('GIPHY');
      itemsRef.current = [];
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
    abortRef.current?.abort();
    abortRef.current = null;
    requestIdRef.current += 1;
    setQueryState(value);
    itemsRef.current = [];
    setItems([]);
    setError(null);
    setHasMore(false);
    setLoadMoreError(false);
    setLoading(value.trim().length > 0);
  }, []);

  const loadMore = useCallback(() => {
    if (!open || loading || loadingMore || !hasMore) return;
    void fetchPage(debouncedQueryRef.current, nextOffset, true, provider);
  }, [open, loading, loadingMore, hasMore, nextOffset, provider, fetchPage]);

  const refresh = useCallback(() => {
    if (!open) return;
    void fetchPage(query, 0, false);
  }, [open, query, fetchPage]);

  const retryLoadMore = useCallback(() => {
    if (!open || loading || loadingMore) return;
    void fetchPage(debouncedQueryRef.current, nextOffset, true, provider);
  }, [open, loading, loadingMore, nextOffset, provider, fetchPage]);

  return {
    provider,
    providers: [...new Set(items.map((item) => item.provider))],
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
