import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatContextType, ChatMessage, ChatType } from '@/api/chat';
import { useDebounce } from '@/components/CityMap/useDebounce';
import { THREAD_SEARCH_RESULTS_CLEAR_MS } from '@/components/chat/chatListMotion';
import {
  searchLocalThreadMessages,
  THREAD_SEARCH_PAGE_SIZE,
} from '@/services/chat/chatLocalThreadMessageSearch';

const SEARCH_DEBOUNCE_MS = 300;

type UseThreadSearchArgs = {
  contextType: ChatContextType;
  contextId: string | undefined;
  /** Active thread tab — PUBLIC / PRIVATE / ADMINS for games; PUBLIC elsewhere. */
  searchChatType: ChatType;
};

export function useThreadSearch({ contextType, contextId, searchChatType }: UseThreadSearchArgs) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isResultsPanelVisible, setIsResultsPanelVisible] = useState(true);
  const [results, setResults] = useState<ChatMessage[]>([]);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [searchGeneration, setSearchGeneration] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [lastSelectedResultId, setLastSelectedResultId] = useState<string | null>(null);
  const resultLimitRef = useRef(THREAD_SEARCH_PAGE_SIZE);
  const prevDebouncedQueryRef = useRef('');
  const lastSelectedResultQueryRef = useRef('');
  const blurSearchInputRef = useRef<(() => void) | null>(null);

  const debouncedSearchQuery = useDebounce(searchQuery, SEARCH_DEBOUNCE_MS);
  const trimmedQuery = searchQuery.trim();
  const trimmedDebouncedQuery = debouncedSearchQuery.trim();

  const isQueryPending =
    isSearchActive && trimmedQuery.length >= 2 && trimmedQuery !== trimmedDebouncedQuery;
  const isLoadingResults = isQueryPending || isSearching;

  const registerSearchInputBlur = useCallback((blur: (() => void) | null) => {
    blurSearchInputRef.current = blur;
  }, []);

  const showSearchResults = useCallback(() => {
    setIsResultsPanelVisible(true);
  }, []);

  const hideSearchResults = useCallback(() => {
    setIsResultsPanelVisible(false);
    blurSearchInputRef.current?.();
  }, []);

  const markSearchResultSelected = useCallback(
    (messageId: string) => {
      lastSelectedResultQueryRef.current = trimmedQuery;
      setLastSelectedResultId(messageId);
    },
    [trimmedQuery]
  );

  const dismissSearch = useCallback(() => {
    setIsSearchActive(false);
    setSearchQuery('');
    setIsResultsPanelVisible(true);
    setLastSelectedResultId(null);
    lastSelectedResultQueryRef.current = '';
  }, []);

  const clearSearch = useCallback(() => {
    dismissSearch();
    setResults([]);
    setHasMoreResults(false);
    resultLimitRef.current = THREAD_SEARCH_PAGE_SIZE;
    prevDebouncedQueryRef.current = '';
    setIsSearching(false);
  }, [dismissSearch]);

  const loadMoreResults = useCallback(() => {
    if (!hasMoreResults || isSearching) return;
    resultLimitRef.current += THREAD_SEARCH_PAGE_SIZE;
    setSearchGeneration((n) => n + 1);
  }, [hasMoreResults, isSearching]);

  useEffect(() => {
    clearSearch();
  }, [contextId, contextType, clearSearch]);

  useEffect(() => {
    resultLimitRef.current = THREAD_SEARCH_PAGE_SIZE;
    prevDebouncedQueryRef.current = '';
    setResults([]);
    setHasMoreResults(false);
    setSearchGeneration((n) => n + 1);
  }, [searchChatType]);

  useEffect(() => {
    if (
      lastSelectedResultQueryRef.current &&
      trimmedDebouncedQuery !== lastSelectedResultQueryRef.current
    ) {
      setLastSelectedResultId(null);
      lastSelectedResultQueryRef.current = '';
    }
  }, [trimmedDebouncedQuery]);

  useEffect(() => {
    if (isSearchActive) return;
    const id = window.setTimeout(() => setResults([]), THREAD_SEARCH_RESULTS_CLEAR_MS);
    return () => window.clearTimeout(id);
  }, [isSearchActive]);

  useEffect(() => {
    resultLimitRef.current = THREAD_SEARCH_PAGE_SIZE;
  }, [trimmedDebouncedQuery, contextType, contextId, searchChatType]);

  useEffect(() => {
    if (!isSearchActive) {
      setIsSearching(false);
      return;
    }

    if (trimmedDebouncedQuery.length < 2 || !contextId) {
      setResults([]);
      setHasMoreResults(false);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    const queryChanged = prevDebouncedQueryRef.current !== trimmedDebouncedQuery;
    prevDebouncedQueryRef.current = trimmedDebouncedQuery;
    if (queryChanged) {
      setResults([]);
      setHasMoreResults(false);
    }
    setIsSearching(true);
    void searchLocalThreadMessages(
      contextType,
      contextId,
      searchChatType,
      trimmedDebouncedQuery,
      resultLimitRef.current
    )
      .then(({ messages, hasMore }) => {
        if (!cancelled) {
          setResults(messages);
          setHasMoreResults(hasMore);
        }
      })
      .finally(() => {
        if (!cancelled) setIsSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    trimmedDebouncedQuery,
    isSearchActive,
    contextType,
    contextId,
    searchChatType,
    searchGeneration,
  ]);

  const resultCount = results.length;
  const displayResults = useMemo(
    () => (isQueryPending ? [] : results),
    [isQueryPending, results]
  );
  const displayHasMoreResults = isQueryPending ? false : hasMoreResults;
  const showResultsPanel =
    isSearchActive && isResultsPanelVisible && trimmedQuery.length >= 2;
  const threadSearchOutlineQuery =
    isSearchActive && trimmedQuery.length >= 2 ? trimmedQuery : null;

  return useMemo(
    () => ({
      searchQuery,
      setSearchQuery,
      debouncedSearchQuery,
      isSearchActive,
      setIsSearchActive,
      isResultsPanelVisible,
      results,
      displayResults,
      resultCount,
      hasMoreResults,
      displayHasMoreResults,
      isSearching,
      isQueryPending,
      isLoadingResults,
      showResultsPanel,
      threadSearchOutlineQuery,
      loadMoreResults,
      registerSearchInputBlur,
      showSearchResults,
      hideSearchResults,
      markSearchResultSelected,
      lastSelectedResultId,
      dismissSearch,
      clearSearch,
    }),
    [
      searchQuery,
      debouncedSearchQuery,
      isSearchActive,
      isResultsPanelVisible,
      results,
      displayResults,
      resultCount,
      hasMoreResults,
      displayHasMoreResults,
      isSearching,
      isQueryPending,
      isLoadingResults,
      showResultsPanel,
      threadSearchOutlineQuery,
      loadMoreResults,
      registerSearchInputBlur,
      showSearchResults,
      hideSearchResults,
      markSearchResultSelected,
      lastSelectedResultId,
      dismissSearch,
      clearSearch,
    ]
  );
}

export type ThreadSearchValue = ReturnType<typeof useThreadSearch>;
