import { useState, useEffect, useCallback, useRef } from 'react';
import { chatApi, UserChat } from '@/api/chat';
import { Game, Bug } from '@/types';
import { useHeaderStore } from '@/store/headerStore';

export interface UnreadObject {
  game?: Game;
  bug?: Bug;
  userChat?: UserChat;
  unreadCount: number;
}

export const useUnreadObjects = (userId: string | undefined) => {
  const [games, setGames] = useState<Game[]>([]);
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [userChats, setUserChats] = useState<UserChat[]>([]);
  const [gamesUnreadCounts, setGamesUnreadCounts] = useState<Record<string, number>>({});
  const [bugsUnreadCounts, setBugsUnreadCounts] = useState<Record<string, number>>({});
  const [userChatsUnreadCounts, setUserChatsUnreadCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const showChatFilter = useHeaderStore((state) => state.showChatFilter);
  const isLoadingRef = useRef(false);

  const loadUnreadObjects = useCallback(async () => {
    if (!userId || isLoadingRef.current) return;

    isLoadingRef.current = true;
    setLoading(true);
    try {
      const response = await chatApi.getUnreadObjects();
      const data = response.data;

      const gameList = data.games.map(item => item.game);
      const bugList = data.bugs.map(item => item.bug);
      const chatList = data.userChats.map(item => item.chat);

      const gameCounts: Record<string, number> = {};
      data.games.forEach(item => {
        gameCounts[item.game.id] = item.unreadCount;
      });

      const bugCounts: Record<string, number> = {};
      data.bugs.forEach(item => {
        bugCounts[item.bug.id] = item.unreadCount;
      });

      const chatCounts: Record<string, number> = {};
      data.userChats.forEach(item => {
        chatCounts[item.chat.id] = item.unreadCount;
      });

      setGames(gameList);
      setBugs(bugList);
      setUserChats(chatList);
      setGamesUnreadCounts(gameCounts);
      setBugsUnreadCounts(bugCounts);
      setUserChatsUnreadCounts(chatCounts);
    } catch (error) {
      console.error('Failed to load unread objects:', error);
    } finally {
      isLoadingRef.current = false;
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (showChatFilter && userId) {
      loadUnreadObjects();
    } else {
      setGames([]);
      setBugs([]);
      setUserChats([]);
      setGamesUnreadCounts({});
      setBugsUnreadCounts({});
      setUserChatsUnreadCounts({});
    }
  }, [showChatFilter, userId, loadUnreadObjects]);

  return {
    games,
    bugs,
    userChats,
    gamesUnreadCounts,
    bugsUnreadCounts,
    userChatsUnreadCounts,
    loading,
    loadUnreadObjects,
  };
};

