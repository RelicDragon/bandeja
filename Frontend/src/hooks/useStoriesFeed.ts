import { useCallback, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useStoriesStore } from '@/store/storiesStore';
import { featureFlags } from '@/config/featureFlags';

export function useStoriesFeed() {
  const user = useAuthStore((s) => s.user);
  const feed = useStoriesStore((s) => s.feed);
  const isLoading = useStoriesStore((s) => s.isLoading);
  const fetchFeed = useStoriesStore((s) => s.fetchFeed);

  useEffect(() => {
    if (!featureFlags.stories || !user?.id) return;
    void fetchFeed();
  }, [user?.id, fetchFeed]);

  const refresh = useCallback(
    (force = true) => {
      if (!featureFlags.stories || !user?.id) return Promise.resolve(null);
      return fetchFeed(force);
    },
    [user?.id, fetchFeed]
  );

  return {
    feed,
    isLoading,
    refresh,
    enabled: featureFlags.stories && !!user?.id,
  };
}
