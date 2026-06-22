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
  currentChatType: ChatType;
};

export function useThreadSearch({ contextType, contextId, currentChatType }: UseThreadSearchArgs) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [results, setResults] = useState<ChatMessage[]>([]);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [searchGeneration, setSearchGeneration] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const resultLimitRef = useRef(THREAD_SEARCH_PAGE_SIZE);

  const debouncedSearchQuery = useDebounce(searchQuery, SEARCH_DEBOUNCE_MS);
  const trimmedQuery = searchQuery.trim();
  const trimmedDebouncedQuery = debouncedSearchQuery.trim();

  const isQueryPending =
    isSearchActive && trimmedQuery.length >= 2 && trimmedQuery !== trimmedDebouncedQuery;
  const isLoadingResults = isQueryPending || isSearching;

  const dismissSearch = useCallback(() => {
    setIsSearchActive(false);
    setSearchQuery('');
  }, []);

  const clearSearch = useCallback(() => {
    dismissSearch();
    setResults([]);
    setHasMoreResults(false);
    resultLimitRef.current = THREAD_SEARCH_PAGE_SIZE;
    setIsSearching(false);
  }, [dismissSearch]);

  const loadMoreResults = useCallback(() => {
    if (!hasMoreResults || isSearching) return;
    resultLimitRef.current += THREAD_SEARCH_PAGE_SIZE;
    setSearchGeneration((n) => n + 1);
  }, [hasMoreResults, isSearching]);

  useEffect(() => {
    clearSearch();
  }, [contextId, contextType, currentChatType, clearSearch]);

  useEffect(() => {
    if (isSearchActive) return;
    const id = window.setTimeout(() => setResults([]), THREAD_SEARCH_RESULTS_CLEAR_MS);
    return () => window.clearTimeout(id);
  }, [isSearchActive]);

  useEffect(() => {
    resultLimitRef.current = THREAD_SEARCH_PAGE_SIZE;
  }, [trimmedDebouncedQuery, contextType, contextId, currentChatType]);

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
    setIsSearching(true);
    void searchLocalThreadMessages(
      contextType,
      contextId,
      currentChatType,
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
    currentChatType,
    searchGeneration,
  ]);

  const resultCount = results.length;
  const showResultsPanel = isSearchActive && trimmedQuery.length >= 2;

  return useMemo(
    () => ({
      searchQuery,
      setSearchQuery,
      debouncedSearchQuery,
      isSearchActive,
      setIsSearchActive,
      results,
      resultCount,
      hasMoreResults,
      isSearching,
      isQueryPending,
      isLoadingResults,
      showResultsPanel,
      loadMoreResults,
      dismissSearch,
      clearSearch,
    }),
    [
      searchQuery,
      debouncedSearchQuery,
      isSearchActive,
      results,
      resultCount,
      hasMoreResults,
      isSearching,
      isQueryPending,
      isLoadingResults,
      showResultsPanel,
      loadMoreResults,
      dismissSearch,
      clearSearch,
    ]
  );
}

export type ThreadSearchValue = ReturnType<typeof useThreadSearch>;
