import { useState, useEffect, useCallback, useRef } from 'react';
import { invitesApi } from '@/api';
import { chatApi } from '@/api/chat';
import { gamesApi } from '@/api';
import { Game, Invite } from '@/types';
import { useSocketEventsStore } from '@/store/socketEventsStore';

export const useMyGames = (
  user: any,
  onLoading: (loading: boolean) => void,
  skeletonAnimation?: { showSkeletonsAnimated: () => void; hideSkeletonsAnimated: () => void }
) => {
  const [games, setGames] = useState<Game[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [gamesUnreadCounts, setGamesUnreadCounts] = useState<Record<string, number>>({});
  const [totalGamesUnreadFromUnreadObjects, setTotalGamesUnreadFromUnreadObjects] = useState<number>(0);

  const isLoadingRef = useRef(false);
  const lastFetchParamsRef = useRef<string | null>(null);

  const sortGames = (games: Game[]) => {
    return games.sort((a, b) => {
      return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
    });
  };

  const fetchGamesWithUnread = async (myGames: Game[], userId: string): Promise<Record<string, number>> => {
    const accessibleGameIds = myGames
      .filter(game => {
        const isParticipant = game.participants.some(p => p.userId === userId);
        const hasPendingInvite = game.participants?.some(p => p.userId === userId && p.status === 'INVITED');
        return isParticipant || hasPendingInvite;
      })
      .map(game => game.id);

    if (accessibleGameIds.length > 0) {
      try {
        const unreadResponse = await chatApi.getGamesUnreadCounts(accessibleGameIds);
        return unreadResponse.data;
      } catch (error) {
        console.error('Failed to fetch unread counts:', error);
        return {};
      }
    }

    return {};
  };

  const fetchData = useCallback(async (showLoader = true, force = false) => {
    if (!user?.id) return;

    const fetchParams = `my-games-${user.id}`;

    if (!force && (isLoadingRef.current || lastFetchParamsRef.current === fetchParams)) {
      return;
    }

    isLoadingRef.current = true;
    lastFetchParamsRef.current = fetchParams;

    try {
      if (showLoader) {
        skeletonAnimation?.showSkeletonsAnimated();
        onLoading(true);
      }

      const [gamesResponse, invitesResponse, unreadObjectsResponse] = await Promise.all([
        gamesApi.getMyGames(),
        invitesApi.getMyInvites('PENDING'),
        chatApi.getUnreadObjects().catch(() => ({ data: { games: [] as { unreadCount: number }[] } })),
      ]);

      const myGames = gamesResponse.data || [];
      const unreadCounts = await fetchGamesWithUnread(myGames, user.id);
      const sortedMyGames = sortGames(myGames);

      const totalGamesUnread = (unreadObjectsResponse.data?.games ?? []).reduce(
        (sum: number, item: { unreadCount: number }) => sum + item.unreadCount,
        0
      );
      setTotalGamesUnreadFromUnreadObjects(totalGamesUnread);

      setGames(sortedMyGames);
      setInvites(invitesResponse.data);
      setGamesUnreadCounts(unreadCounts);
    } catch (error) {
      console.error('Failed to fetch my games:', error);
    } finally {
      isLoadingRef.current = false;
      if (showLoader) {
        skeletonAnimation?.hideSkeletonsAnimated();
        onLoading(false);
      }
    }
  }, [user?.id, skeletonAnimation, onLoading]);

  useEffect(() => {
    if (user?.id) {
      fetchData();
    }
  }, [user?.id, fetchData]);


  const lastNewInvite = useSocketEventsStore((state) => state.lastNewInvite);
  const lastInviteDeleted = useSocketEventsStore((state) => state.lastInviteDeleted);
  const lastGameUpdate = useSocketEventsStore((state) => state.lastGameUpdate);

  useEffect(() => {
    if (!lastNewInvite) return;
    setInvites(prevInvites => {
      const exists = prevInvites.some(existingInvite => existingInvite.id === lastNewInvite.id);
      if (exists) return prevInvites;
      return [lastNewInvite, ...prevInvites];
    });
  }, [lastNewInvite]);

  useEffect(() => {
    if (!lastInviteDeleted) return;
    setInvites(prevInvites => prevInvites.filter(invite => invite.id !== lastInviteDeleted.inviteId));
  }, [lastInviteDeleted]);

  useEffect(() => {
    if (!lastGameUpdate || (!lastGameUpdate.forceUpdate && lastGameUpdate.senderId === user?.id)) return;

    const data = lastGameUpdate;
    const updatedGame = data.game;

    setGames(prevGames => {
      const gameIndex = prevGames.findIndex(g => g.id === data.gameId);
      const isParticipant = updatedGame.participants.some((p: any) => p.userId === user?.id);

      if (gameIndex === -1) {
        if (!isParticipant) return prevGames;

        const isArchived = updatedGame.status === 'ARCHIVED';
        if (!isArchived) {
          const newGames = [...prevGames, updatedGame];
          return sortGames(newGames);
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const gameDate = new Date(updatedGame.startTime);
        gameDate.setHours(0, 0, 0, 0);
        if (gameDate >= today) {
          const newGames = [...prevGames, updatedGame];
          return sortGames(newGames);
        }
        return prevGames;
      }

      if (!isParticipant) {
        return prevGames.filter(g => g.id !== data.gameId);
      }

      const isArchived = updatedGame.status === 'ARCHIVED';
      if (isArchived) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const gameDate = new Date(updatedGame.startTime);
        gameDate.setHours(0, 0, 0, 0);
        if (gameDate < today) {
          return prevGames.filter(g => g.id !== data.gameId);
        }
      }

      const updatedGames = [...prevGames];
      updatedGames[gameIndex] = updatedGame;
      return sortGames(updatedGames);
    });
  }, [lastGameUpdate, user?.id]);

  return {
    games,
    invites,
    gamesUnreadCounts,
    totalGamesUnreadFromUnreadObjects,
    fetchData,
    setInvites,
  };
};
