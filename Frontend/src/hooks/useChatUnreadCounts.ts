import { useState, useEffect, useCallback, useRef } from 'react';
import { chatApi } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';
import { usePlayersStore } from '@/store/playersStore';

interface ChatUnreadCounts {
  users: number;
  games: number;
  bugs: number;
}

export const useChatUnreadCounts = () => {
  const { user } = useAuthStore();
  const userChatsUnreadCounts = usePlayersStore((state) => state.unreadCounts);
  const [counts, setCounts] = useState<ChatUnreadCounts>({
    users: 0,
    games: 0,
    bugs: 0,
  });
  const [loading, setLoading] = useState(false);
  const isLoadingRef = useRef(false);

  const fetchUnreadCounts = useCallback(async () => {
    if (!user?.id || isLoadingRef.current) return;

    isLoadingRef.current = true;
    setLoading(true);
    try {
      const response = await chatApi.getUnreadObjects();
      const data = response.data;

      const gamesTotal = data.games.reduce((sum, item) => sum + item.unreadCount, 0);
      const bugsTotal = data.bugs.reduce((sum, item) => sum + item.unreadCount, 0);

      setCounts({
        users: Object.values(userChatsUnreadCounts).reduce((sum, count) => sum + count, 0),
        games: gamesTotal,
        bugs: bugsTotal,
      });
    } catch (error) {
      console.error('Failed to fetch chat unread counts:', error);
    } finally {
      isLoadingRef.current = false;
      setLoading(false);
    }
  }, [user?.id, userChatsUnreadCounts]);

  useEffect(() => {
    if (user?.id) {
      fetchUnreadCounts();
    }
  }, [user?.id, fetchUnreadCounts]);

  useEffect(() => {
    setCounts(prev => ({
      ...prev,
      users: Object.values(userChatsUnreadCounts).reduce((sum, count) => sum + count, 0),
    }));
  }, [userChatsUnreadCounts]);

  return {
    counts,
    loading,
    refetch: fetchUnreadCounts,
  };
};
