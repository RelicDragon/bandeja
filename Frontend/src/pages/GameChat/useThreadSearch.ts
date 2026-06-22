import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChatContextType, ChatMessage, ChatType } from '@/api/chat';
import { useDebounce } from '@/components/CityMap/useDebounce';
import { THREAD_SEARCH_RESULTS_CLEAR_MS } from '@/components/chat/chatListMotion';
import { searchLocalThreadMessages } from '@/services/chat/chatLocalThreadMessageSearch';

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
  const [isSearching, setIsSearching] = useState(false);

  const debouncedSearchQuery = useDebounce(searchQuery, SEARCH_DEBOUNCE_MS);

  const dismissSearch = useCallback(() => {
    setIsSearchActive(false);
    setSearchQuery('');
  }, []);

  const clearSearch = useCallback(() => {
    dismissSearch();
    setResults([]);
    setIsSearching(false);
  }, [dismissSearch]);

  useEffect(() => {
    clearSearch();
  }, [contextId, contextType, currentChatType, clearSearch]);

  useEffect(() => {
    if (isSearchActive) return;
    const id = window.setTimeout(() => setResults([]), THREAD_SEARCH_RESULTS_CLEAR_MS);
    return () => window.clearTimeout(id);
  }, [isSearchActive]);

  useEffect(() => {
    const trimmed = debouncedSearchQuery.trim();
    if (!isSearchActive || trimmed.length < 2 || !contextId) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    void searchLocalThreadMessages(contextType, contextId, currentChatType, trimmed)
      .then((hits) => {
        if (!cancelled) setResults(hits);
      })
      .finally(() => {
        if (!cancelled) setIsSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearchQuery, isSearchActive, contextType, contextId, currentChatType]);

  const resultCount = results.length;
  const showResultsPanel = isSearchActive && debouncedSearchQuery.trim().length >= 2;

  return useMemo(
    () => ({
      searchQuery,
      setSearchQuery,
      debouncedSearchQuery,
      isSearchActive,
      setIsSearchActive,
      results,
      resultCount,
      isSearching,
      showResultsPanel,
      dismissSearch,
      clearSearch,
    }),
    [
      searchQuery,
      debouncedSearchQuery,
      isSearchActive,
      results,
      resultCount,
      isSearching,
      showResultsPanel,
      dismissSearch,
      clearSearch,
    ]
  );
}

export type ThreadSearchValue = ReturnType<typeof useThreadSearch>;
