import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import {
  useReactionEmojiUsageStore,
  subscribeReactionEmojiUsageBroadcast,
} from '@/store/reactionEmojiUsageStore';
import { usersApi } from '@/api/users';

const STALE_MS = 10 * 60 * 1000;

export function ReactionEmojiUsageBootstrap() {
  const userId = useAuthStore((s) => s.user?.id);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    return subscribeReactionEmojiUsageBroadcast((remoteVersion) => {
      const local = useReactionEmojiUsageStore.getState().version;
      if (remoteVersion <= local) return;
      void usersApi.getReactionEmojiUsage().then((res) => {
        const d = res.data;
        if (!d || ('unchanged' in d && d.unchanged)) return;
        useReactionEmojiUsageStore.getState().hydrate({ version: d.version, items: d.items });
      });
    });
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      useReactionEmojiUsageStore.getState().reset();
      return;
    }
    useReactionEmojiUsageStore.setState({ status: 'loading', lastError: null });
    void usersApi
      .getReactionEmojiUsage()
      .then((res) => {
        const d = res.data;
        if (!d) return;
        if ('unchanged' in d && d.unchanged) return;
        useReactionEmojiUsageStore.getState().hydrate({ version: d.version, items: d.items });
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        useReactionEmojiUsageStore.setState({ status: 'error', lastError: msg });
      });
  }, [isAuthenticated, userId]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      const s = useReactionEmojiUsageStore.getState();
      if (s.status !== 'ready') return;
      if (Date.now() - s.lastFetchedAt <= STALE_MS) return;
      void usersApi.getReactionEmojiUsage({ sinceVersion: s.version }).then((res) => {
        const d = res.data;
        if (!d) return;
        if ('unchanged' in d && d.unchanged) {
          useReactionEmojiUsageStore.setState({ lastFetchedAt: Date.now() });
          return;
        }
        useReactionEmojiUsageStore.getState().hydrate({ version: d.version, items: d.items });
      });
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, []);

  return null;
}
