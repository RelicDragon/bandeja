import { useCallback, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useStoriesStore } from '@/store/storiesStore';

export function useStoriesFeed(options?: { enabled?: boolean }) {
  const user = useAuthStore((s) => s.user);
  const feed = useStoriesStore((s) => s.feed);
  const isLoading = useStoriesStore((s) => s.isLoading);
  const fetchFeed = useStoriesStore((s) => s.fetchFeed);
  const enabled = options?.enabled !== false;

  useEffect(() => {
    if (!user?.id || !enabled) return;
    void fetchFeed();
  }, [user?.id, fetchFeed, enabled]);

  const refresh = useCallback(
    (force = true) => {
      if (!user?.id) return Promise.resolve(null);
      return fetchFeed(force);
    },
    [user?.id, fetchFeed]
  );

  return {
    feed,
    isLoading,
    refresh,
    enabled: !!user?.id,
  };
}
