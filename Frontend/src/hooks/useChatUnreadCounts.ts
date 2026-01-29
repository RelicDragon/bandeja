import { useState, useEffect, useCallback, useRef } from 'react';
import { chatApi, GroupChannel } from '@/api/chat';
import { Game } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { usePlayersStore } from '@/store/playersStore';
import { useSocketEventsStore } from '@/store/socketEventsStore';

interface ChatUnreadCounts {
  users: number;
  games: number;
  bugs: number;
  channels: number;
}

interface UnreadObjectsResponse {
  games: Array<{ game: Game; unreadCount: number }>;
  bugs: Array<{ bug: unknown; unreadCount: number }>;
  userChats: Array<{ chat: unknown; unreadCount: number }>;
  groupChannels: Array<{ groupChannel: GroupChannel; unreadCount: number }>;
}

const unreadObjectsCache = new Map<string, { data: UnreadObjectsResponse; timestamp: number }>();
const unreadObjectsLoading = new Map<string, Promise<{ data: UnreadObjectsResponse }>>();
const UNREAD_CACHE_TTL = 2000;
const DEBOUNCE_DELAY = 300;

export const useChatUnreadCounts = () => {
  const { user } = useAuthStore();
  const userChatsUnreadCounts = usePlayersStore((state) => state.unreadCounts);
  const lastChatMessage = useSocketEventsStore((state) => state.lastChatMessage);
  const lastChatUnreadCount = useSocketEventsStore((state) => state.lastChatUnreadCount);
  const lastChatReadReceipt = useSocketEventsStore((state) => state.lastChatReadReceipt);
  const [counts, setCounts] = useState<ChatUnreadCounts>({
    users: 0,
    games: 0,
    bugs: 0,
    channels: 0,
  });
  const [loading, setLoading] = useState(false);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchUnreadCounts = useCallback(async () => {
    if (!user?.id) return;

    const cacheKey = `unread-objects-${user.id}`;
    const cached = unreadObjectsCache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < UNREAD_CACHE_TTL) {
      const data = cached.data;
      const gamesTotal = data.games.reduce((sum: number, item) => sum + item.unreadCount, 0);
      const bugsTotal = data.bugs.reduce((sum: number, item) => sum + item.unreadCount, 0);
      const channelsTotal = (data.groupChannels || []).reduce((sum: number, item) => sum + item.unreadCount, 0);

      setCounts({
        users: Object.values(userChatsUnreadCounts).reduce((sum: number, count: number) => sum + count, 0),
        games: gamesTotal,
        bugs: bugsTotal,
        channels: channelsTotal,
      });
      return;
    }

    const existingPromise = unreadObjectsLoading.get(cacheKey);
    if (existingPromise) {
      try {
        const response = await existingPromise;
        const data = response.data;
        const gamesTotal = data.games.reduce((sum: number, item) => sum + item.unreadCount, 0);
        const bugsTotal = data.bugs.reduce((sum: number, item) => sum + item.unreadCount, 0);
        const channelsTotal = (data.groupChannels || []).reduce((sum: number, item) => sum + item.unreadCount, 0);

        setCounts({
          users: Object.values(userChatsUnreadCounts).reduce((sum: number, count: number) => sum + count, 0),
          games: gamesTotal,
          bugs: bugsTotal,
          channels: channelsTotal,
        });
      } catch (error) {
        console.error('Failed to fetch chat unread counts:', error);
      }
      return;
    }

    setLoading(true);
    const promise = chatApi.getUnreadObjects().then(response => {
      unreadObjectsCache.set(cacheKey, { data: response.data, timestamp: Date.now() });
      setTimeout(() => {
        unreadObjectsCache.delete(cacheKey);
        unreadObjectsLoading.delete(cacheKey);
      }, UNREAD_CACHE_TTL);
      return response;
    }).catch(error => {
      unreadObjectsLoading.delete(cacheKey);
      throw error;
    });

    unreadObjectsLoading.set(cacheKey, promise);

    try {
      const response = await promise;
      const data = response.data;

      const gamesTotal = data.games.reduce((sum: number, item) => sum + item.unreadCount, 0);
      const bugsTotal = data.bugs.reduce((sum: number, item) => sum + item.unreadCount, 0);
      const channelsTotal = (data.groupChannels || []).reduce((sum: number, item) => sum + item.unreadCount, 0);

      setCounts({
        users: Object.values(userChatsUnreadCounts).reduce((sum: number, count: number) => sum + count, 0),
        games: gamesTotal,
        bugs: bugsTotal,
        channels: channelsTotal,
      });
    } catch (error) {
      console.error('Failed to fetch chat unread counts:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id, userChatsUnreadCounts]);

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
    if (user?.id) {
      fetchUnreadCounts();
    }
  }, [user?.id, fetchUnreadCounts]);

  useEffect(() => {
    const handleInvalidation = () => {
      if (user?.id) {
        const cacheKey = `unread-objects-${user.id}`;
        unreadObjectsCache.delete(cacheKey);
        unreadObjectsLoading.delete(cacheKey);
        debouncedFetch();
      }
    };

    window.addEventListener('unread-count-invalidated', handleInvalidation);

    return () => {
      window.removeEventListener('unread-count-invalidated', handleInvalidation);
    };
  }, [user?.id, debouncedFetch]);

  useEffect(() => {
    setCounts(prev => ({
      ...prev,
      users: Object.values(userChatsUnreadCounts).reduce((sum: number, count: number) => sum + count, 0),
    }));
  }, [userChatsUnreadCounts]);

  useEffect(() => {
    if (!lastChatMessage || lastChatMessage.message?.senderId === user?.id) return;
    debouncedFetch();
  }, [lastChatMessage, user?.id, debouncedFetch]);

  useEffect(() => {
    if (!lastChatUnreadCount) return;
    debouncedFetch();
  }, [lastChatUnreadCount, debouncedFetch]);

  useEffect(() => {
    if (!lastChatReadReceipt || lastChatReadReceipt.readReceipt?.userId !== user?.id) return;
    debouncedFetch();
  }, [lastChatReadReceipt, user?.id, debouncedFetch]);

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
