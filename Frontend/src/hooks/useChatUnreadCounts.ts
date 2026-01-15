import { useState, useEffect, useCallback, useRef } from 'react';
import { chatApi } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';
import { usePlayersStore } from '@/store/playersStore';
import { socketService } from '@/services/socketService';

interface ChatUnreadCounts {
  users: number;
  games: number;
  bugs: number;
  channels: number;
}

export const useChatUnreadCounts = () => {
  const { user } = useAuthStore();
  const userChatsUnreadCounts = usePlayersStore((state) => state.unreadCounts);
  const [counts, setCounts] = useState<ChatUnreadCounts>({
    users: 0,
    games: 0,
    bugs: 0,
    channels: 0,
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
      const channelsTotal = (data.groupChannels || []).reduce((sum, item) => sum + item.unreadCount, 0);

      setCounts({
        users: Object.values(userChatsUnreadCounts).reduce((sum, count) => sum + count, 0),
        games: gamesTotal,
        bugs: bugsTotal,
        channels: channelsTotal,
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

  useEffect(() => {
    if (!user?.id) return;

    const handleChatMessage = (data: { contextType: string; contextId: string; message: any }) => {
      // Refetch for all context types when message is from another user
      if (data.message?.senderId !== user?.id) {
        fetchUnreadCounts();
      }
    };

    const handleUnreadCountUpdate = () => {
      // Refetch for all context types when unread count is updated
      fetchUnreadCounts();
    };

    const handleReadReceipt = (data: { contextType: string; contextId: string; readReceipt: any }) => {
      // Refetch when user marks messages as read
      if (data.readReceipt?.userId === user?.id) {
        fetchUnreadCounts();
      }
    };

    socketService.on('chat:message', handleChatMessage);
    socketService.on('chat:unread-count', handleUnreadCountUpdate);
    socketService.on('chat:read-receipt', handleReadReceipt);

    return () => {
      socketService.off('chat:message', handleChatMessage);
      socketService.off('chat:unread-count', handleUnreadCountUpdate);
      socketService.off('chat:read-receipt', handleReadReceipt);
    };
  }, [user?.id, fetchUnreadCounts]);

  return {
    counts,
    loading,
    refetch: fetchUnreadCounts,
  };
};
