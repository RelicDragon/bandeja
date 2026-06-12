import { useCallback, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useStoriesStore } from '@/store/storiesStore';

export function useStoriesFeed() {
  const user = useAuthStore((s) => s.user);
  const feed = useStoriesStore((s) => s.feed);
  const isLoading = useStoriesStore((s) => s.isLoading);
  const fetchFeed = useStoriesStore((s) => s.fetchFeed);

  useEffect(() => {
    if (!user?.id) return;
    void fetchFeed();
  }, [user?.id, fetchFeed]);

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
