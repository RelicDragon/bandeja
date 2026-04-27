import { useState, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import { chatApi } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';
import { usePlayersStore } from '@/store/playersStore';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { chatItemsFromUnreadGames, persistThreadIndexReplace } from '@/services/chat/chatThreadIndex';
import { scheduleWarmFromUnreadApiPayload } from '@/services/chat/chatSyncBatchWarm';
import type { UnreadObjectsApiPayload } from '@/services/chat/chatUnreadPayload';
import { unreadCategoryTotalsFromPayload } from '@/services/chat/chatUnreadPayload';

interface ChatUnreadCounts {
  users: number;
  games: number;
  bugs: number;
  groups: number;
  channels: number;
  marketplace: number;
}

const unreadObjectsCache = new Map<string, { data: UnreadObjectsApiPayload; timestamp: number }>();
const unreadObjectsLoading = new Map<string, Promise<{ data: UnreadObjectsApiPayload }>>();
const UNREAD_CACHE_TTL = 2000;
const DEBOUNCE_DELAY = 300;
const INVALIDATION_DEBOUNCE_MS = 550;

let unreadObjectsInvalidationEpoch = 0;

function persistGamesThreadIndex(data: UnreadObjectsApiPayload): void {
  void persistThreadIndexReplace('games', chatItemsFromUnreadGames(data.games), { pruneRemoved: true });
}

function applyUnreadPayloadToState(
  data: UnreadObjectsApiPayload,
  userChatsUnreadCounts: Record<string, number>,
  setCounts: Dispatch<SetStateAction<ChatUnreadCounts>>
): void {
  const t = unreadCategoryTotalsFromPayload(data);
  setCounts({
    users: Object.values(userChatsUnreadCounts).reduce((sum: number, count: number) => sum + count, 0),
    games: t.games,
    bugs: t.bugs,
    groups: t.groups,
    channels: t.channels,
    marketplace: t.marketplace,
  });
  persistGamesThreadIndex(data);
  scheduleWarmFromUnreadApiPayload(data);
}

export const useChatUnreadCounts = () => {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userChatsUnreadCounts = usePlayersStore((state) => state.unreadCounts);
  const lastChatMessage = useSocketEventsStore((state) => state.lastChatMessage);
  const lastChatUnreadCount = useSocketEventsStore((state) => state.lastChatUnreadCount);
  const lastChatReadReceipt = useSocketEventsStore((state) => state.lastChatReadReceipt);
  const [counts, setCounts] = useState<ChatUnreadCounts>({
    users: 0,
    games: 0,
    bugs: 0,
    groups: 0,
    channels: 0,
    marketplace: 0,
  });
  const [loading, setLoading] = useState(false);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const invalidationDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchUnreadCounts = useCallback(async () => {
    const { user: u, isAuthenticated: authed, token } = useAuthStore.getState();
    const lsTok = typeof localStorage !== 'undefined' ? localStorage.getItem('token')?.trim() : '';
    if (!authed || !u?.id || !(token?.trim() || lsTok)) return;

    const cacheKey = `unread-objects-${u.id}`;
    const fetchEpoch = unreadObjectsInvalidationEpoch;
    const applyIfCurrent = (data: UnreadObjectsApiPayload) => {
      if (fetchEpoch !== unreadObjectsInvalidationEpoch) {
        queueMicrotask(() => {
          void fetchUnreadCounts();
        });
        return;
      }
      const liveUserCounts = usePlayersStore.getState().unreadCounts;
      applyUnreadPayloadToState(data, liveUserCounts, setCounts);
    };

    const cached = unreadObjectsCache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < UNREAD_CACHE_TTL) {
      applyIfCurrent(cached.data);
      return;
    }

    const existingPromise = unreadObjectsLoading.get(cacheKey);
    if (existingPromise) {
      try {
        const response = await existingPromise;
        applyIfCurrent(response.data);
      } catch (error) {
        console.error('Failed to fetch chat unread counts:', error);
      }
      return;
    }

    setLoading(true);
    const promise = chatApi.getUnreadObjects().then((response) => {
      const data = response.data;
      unreadObjectsCache.set(cacheKey, { data, timestamp: Date.now() });
      setTimeout(() => {
        unreadObjectsCache.delete(cacheKey);
        unreadObjectsLoading.delete(cacheKey);
      }, UNREAD_CACHE_TTL);
      return { data };
    }).catch(error => {
      unreadObjectsLoading.delete(cacheKey);
      throw error;
    });

    unreadObjectsLoading.set(cacheKey, promise);

    try {
      const response = await promise;
      applyIfCurrent(response.data);
    } catch (error) {
      console.error('Failed to fetch chat unread counts:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const debouncedFetch = useCallback(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      fetchUnreadCounts();
      debounceTimeoutRef.current = null;
    }, DEBOUNCE_DELAY);
  }, [fetchUnreadCounts]);

  useEffect(() => {
    if (isAuthenticated && user?.id) {
      fetchUnreadCounts();
    }
  }, [isAuthenticated, user?.id, fetchUnreadCounts]);

  useEffect(() => {
    const handleInvalidation = () => {
      const { user: u, isAuthenticated: authed } = useAuthStore.getState();
      if (!authed || !u?.id) return;
      unreadObjectsInvalidationEpoch += 1;
      const cacheKey = `unread-objects-${u.id}`;
      unreadObjectsCache.delete(cacheKey);
      if (invalidationDebounceRef.current) clearTimeout(invalidationDebounceRef.current);
      invalidationDebounceRef.current = setTimeout(() => {
        invalidationDebounceRef.current = null;
        debouncedFetch();
      }, INVALIDATION_DEBOUNCE_MS);
    };

    window.addEventListener('unread-count-invalidated', handleInvalidation);

    return () => {
      window.removeEventListener('unread-count-invalidated', handleInvalidation);
      if (invalidationDebounceRef.current) clearTimeout(invalidationDebounceRef.current);
    };
  }, [debouncedFetch]);

  useEffect(() => {
    setCounts(prev => ({
      ...prev,
      users: Object.values(userChatsUnreadCounts).reduce((sum: number, count: number) => sum + count, 0),
    }));
  }, [userChatsUnreadCounts]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    if (!lastChatMessage || lastChatMessage.message?.senderId === user?.id) return;
    debouncedFetch();
  }, [lastChatMessage, user?.id, isAuthenticated, debouncedFetch]);

  useEffect(() => {
    if (!lastChatUnreadCount) return;
    if (!isAuthenticated || !user?.id) return;
    unreadObjectsInvalidationEpoch += 1;
    unreadObjectsCache.delete(`unread-objects-${user.id}`);
    debouncedFetch();
  }, [lastChatUnreadCount, user?.id, isAuthenticated, debouncedFetch]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    if (!lastChatReadReceipt || lastChatReadReceipt.readReceipt?.userId !== user?.id) return;
    debouncedFetch();
  }, [lastChatReadReceipt, user?.id, isAuthenticated, debouncedFetch]);

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  return {
    counts,
    loading,
    refetch: fetchUnreadCounts,
  };
};
