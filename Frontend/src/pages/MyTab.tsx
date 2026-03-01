import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { format, startOfDay } from 'date-fns';
import { InvitesSection, MyGamesSection, PastGamesSection } from '@/components/home';
import { Button, Divider, MainTabFooter, MonthCalendar } from '@/components';
import { RefreshIndicator } from '@/components/RefreshIndicator';
import { chatApi } from '@/api/chat';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/store/authStore';
import { useNavigationStore } from '@/store/navigationStore';
import { useHeaderStore } from '@/store/headerStore';
import { useSkeletonAnimation } from '@/hooks/useSkeletonAnimation';
import { useMyGames } from '@/hooks/useMyGames';
import { usePastGames } from '@/hooks/usePastGames';
import { getAvailableGameChatTypes } from '@/utils/chatType';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { clearCachesExceptUnsyncedResults } from '@/utils/cacheUtils';

const sortGamesByStatusAndDateTime = <T extends { status?: string; startTime: string; parentId?: string; id: string }>(
  list: T[] = [],
  unreadCounts?: Record<string, number>
): T[] => {
  const getStatusPriority = (status?: string): number => {
    if (status === 'ANNOUNCED' || status === 'STARTED') return 0;
    if (status === 'FINISHED') return 1;
    if (status === 'ARCHIVED') return 2;
    return 3;
  };

  const isPrimaryGame = (game: T): boolean => !game.parentId;
  const hasUnreadChats = (game: T): boolean => (unreadCounts?.[game.id] || 0) > 0;

  return [...list].sort((a, b) => {
    const aIsPrimaryWithUnread = isPrimaryGame(a) && hasUnreadChats(a);
    const bIsPrimaryWithUnread = isPrimaryGame(b) && hasUnreadChats(b);

    if (aIsPrimaryWithUnread && !bIsPrimaryWithUnread) return -1;
    if (!aIsPrimaryWithUnread && bIsPrimaryWithUnread) return 1;

    const statusPriorityA = getStatusPriority(a.status);
    const statusPriorityB = getStatusPriority(b.status);
    
    if (statusPriorityA !== statusPriorityB) {
      return statusPriorityA - statusPriorityB;
    }
    
    const dateTimeA = new Date(a.startTime).getTime();
    const dateTimeB = new Date(b.startTime).getTime();
    
    if (statusPriorityA === 0) {
      return dateTimeA - dateTimeB;
    }
    
    return dateTimeB - dateTimeA;
  });
};

const sortMyGamesByStatusAndDateTime = <T extends { status?: string; startTime: string; parentId?: string; id: string; entityType?: string }>(
  list: T[] = [],
  unreadCounts?: Record<string, number>
): T[] => {
  const getStatusPriority = (status?: string): number => {
    if (status === 'ANNOUNCED' || status === 'STARTED') return 0;
    if (status === 'FINISHED') return 1;
    if (status === 'ARCHIVED') return 2;
    return 3;
  };

  const isPrimaryGame = (game: T): boolean => !game.parentId;
  const hasUnreadChats = (game: T): boolean => (unreadCounts?.[game.id] || 0) > 0;
  const isLeagueSeason = (game: T): boolean => game.entityType === 'LEAGUE_SEASON';

  return [...list].sort((a, b) => {
    const aIsLeagueSeason = isLeagueSeason(a);
    const bIsLeagueSeason = isLeagueSeason(b);

    if (aIsLeagueSeason && !bIsLeagueSeason) return -1;
    if (!aIsLeagueSeason && bIsLeagueSeason) return 1;

    const aIsPrimaryWithUnread = isPrimaryGame(a) && hasUnreadChats(a);
    const bIsPrimaryWithUnread = isPrimaryGame(b) && hasUnreadChats(b);

    if (aIsPrimaryWithUnread && !bIsPrimaryWithUnread) return -1;
    if (!aIsPrimaryWithUnread && bIsPrimaryWithUnread) return 1;

    const statusPriorityA = getStatusPriority(a.status);
    const statusPriorityB = getStatusPriority(b.status);
    
    if (statusPriorityA !== statusPriorityB) {
      return statusPriorityA - statusPriorityB;
    }
    
    const dateTimeA = new Date(a.startTime).getTime();
    const dateTimeB = new Date(b.startTime).getTime();
    
    if (statusPriorityA === 0) {
      return dateTimeA - dateTimeB;
    }
    
    return dateTimeB - dateTimeA;
  });
};

export const MyTab = () => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const { unreadMessages, setMyGamesUnreadCount, setPastGamesUnreadCount } = useHeaderStore(
    useShallow((s) => ({ unreadMessages: s.unreadMessages, setMyGamesUnreadCount: s.setMyGamesUnreadCount, setPastGamesUnreadCount: s.setPastGamesUnreadCount }))
  );
  const activeTab = useNavigationStore((s) => s.activeTab);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab]);

  const [loading, setLoading] = useState(true);

  const skeletonAnimation = useSkeletonAnimation();
  
  const {
    games,
    invites,
    gamesUnreadCounts,
    totalGamesUnreadFromUnreadObjects,
    setInvites,
    fetchData,
  } = useMyGames(user, (loadingState) => setLoading(loadingState), {
    showSkeletonsAnimated: skeletonAnimation.showSkeletonsAnimated,
    hideSkeletonsAnimated: skeletonAnimation.hideSkeletonsAnimated,
  });

  const {
    pastGames,
    loadingPastGames,
    hasMorePastGames,
    pastGamesUnreadCounts,
    loadPastGames,
    refetchGame,
  } = usePastGames(user, activeTab === 'past-games');

  const mergedUnreadCounts = useMemo(() => {
    return { ...gamesUnreadCounts, ...pastGamesUnreadCounts };
  }, [gamesUnreadCounts, pastGamesUnreadCounts]);

  const filteredMyGames = useMemo(() => sortMyGamesByStatusAndDateTime(games, mergedUnreadCounts), [games, mergedUnreadCounts]);
  const [myGamesSelectedDate, setMyGamesSelectedDate] = useState<Date>(() => new Date());
  const myGamesForSelectedDate = useMemo(() => {
    const selectedStr = format(startOfDay(myGamesSelectedDate), 'yyyy-MM-dd');
    return filteredMyGames.filter((g) => {
      if (g.timeIsSet === false) return false;
      const gameStr = format(startOfDay(new Date(g.startTime)), 'yyyy-MM-dd');
      return gameStr === selectedStr;
    });
  }, [filteredMyGames, myGamesSelectedDate]);
  const filteredPastGames = useMemo(() => sortGamesByStatusAndDateTime(pastGames, pastGamesUnreadCounts), [pastGames, pastGamesUnreadCounts]);

  const myGamesTotalUnread = useMemo(() => {
    return Object.values(gamesUnreadCounts).reduce((sum: number, count: number) => sum + count, 0);
  }, [gamesUnreadCounts]);

  const pastGamesTotalUnread = useMemo(() => {
    return Object.values(pastGamesUnreadCounts).reduce((sum: number, count: number) => sum + count, 0);
  }, [pastGamesUnreadCounts]);

  const totalGamesUnreadCount = totalGamesUnreadFromUnreadObjects;

  useEffect(() => {
    setMyGamesUnreadCount(myGamesTotalUnread);
  }, [myGamesTotalUnread, setMyGamesUnreadCount]);

  useEffect(() => {
    if (loading || !totalGamesUnreadCount) {
      setPastGamesUnreadCount(0);
      return;
    }
    const calculatedPastGamesUnread = Math.max(0, totalGamesUnreadCount - myGamesTotalUnread);
    const actualPastGamesUnread = pastGamesTotalUnread;
    const pastGamesUnread = actualPastGamesUnread > 0 ? actualPastGamesUnread : calculatedPastGamesUnread;
    setPastGamesUnreadCount(pastGamesUnread);
  }, [totalGamesUnreadCount, myGamesTotalUnread, pastGamesTotalUnread, loading, setPastGamesUnreadCount]);

  const [isMarkingAllAsRead, setIsMarkingAllAsRead] = useState(false);

  const getAvailableChatTypes = (game: any) => {
    const participant = game.participants?.find((p: any) => p.userId === user?.id);
    return getAvailableGameChatTypes(game, participant ?? undefined);
  };

  const handleMarkAllAsRead = async () => {
    if (!user?.id || isMarkingAllAsRead) return;

    setIsMarkingAllAsRead(true);
    try {
      const unreadObjectsResponse = await chatApi.getUnreadObjects();
      const unreadObjects = unreadObjectsResponse.data;
      
      const gamesWithUnread = unreadObjects.games.map(item => item.game);
      const bugsWithUnreadMessages = unreadObjects.bugs.map(item => item.bug);
      const userChatsWithUnread = unreadObjects.userChats.map(item => item.chat);
      const groupChannelsWithUnread = (unreadObjects.groupChannels || []).map(item => item.groupChannel);
      
      if (gamesWithUnread.length === 0 && bugsWithUnreadMessages.length === 0 && userChatsWithUnread.length === 0 && groupChannelsWithUnread.length === 0) {
        setIsMarkingAllAsRead(false);
        return;
      }

      const markPromises = gamesWithUnread.map(game => {
        const chatTypes = getAvailableChatTypes(game);
        return chatApi.markAllMessagesAsRead(game.id, chatTypes);
      });

      const bugMarkPromises = bugsWithUnreadMessages
        .filter((bug: any) => bug?.groupChannelId)
        .map((bug: any) => chatApi.markGroupChannelAsRead(bug.groupChannelId));

      const userChatMarkPromises = userChatsWithUnread.map(chat =>
        chatApi.markUserChatAsRead(chat.id)
      );

      const groupChannelMarkPromises = groupChannelsWithUnread.map(groupChannel =>
        chatApi.markAllMessagesAsReadForContext('GROUP', groupChannel.id)
      );

      await Promise.all([...markPromises, ...bugMarkPromises, ...userChatMarkPromises, ...groupChannelMarkPromises]);

      const { setUnreadMessages } = useHeaderStore.getState();
      setUnreadMessages(0);

      await fetchData(false, true);

      const updatedUnreadResponse = await chatApi.getUnreadCount();
      setUnreadMessages(updatedUnreadResponse.data.count || 0);
      
      toast.success(t('chat.allMarkedAsRead', { defaultValue: 'All messages marked as read' }));
    } catch (error) {
      console.error('Failed to mark all messages as read:', error);
      toast.error(t('errors.generic', { defaultValue: 'Failed to mark all messages as read' }));
    } finally {
      setIsMarkingAllAsRead(false);
    }
  };

  const handleAcceptInvite = async (inviteId: string) => {
    try {
      const { invitesApi } = await import('@/api');
      const response = await invitesApi.accept(inviteId);
      const message = (response as any).message || 'Invite accepted successfully';
      
      if (message === 'games.addedToJoinQueue') {
        toast.success(t('games.addedToJoinQueue', { defaultValue: 'Added to join queue' }));
      } else {
        toast.success(t(message, { defaultValue: message }));
      }
      
      setInvites(invites.filter((inv) => inv.id !== inviteId));
      const { setPendingInvites } = useHeaderStore.getState();
      const currentCount = useHeaderStore.getState().pendingInvites;
      setPendingInvites(Math.max(0, currentCount - 1));
      Promise.resolve().then(() => {
        fetchData(false, true);
      });
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleDeclineInvite = async (inviteId: string) => {
    try {
      const { invitesApi } = await import('@/api');
      await invitesApi.decline(inviteId);
      setInvites(invites.filter((inv) => inv.id !== inviteId));
      const { setPendingInvites } = useHeaderStore.getState();
      const currentCount = useHeaderStore.getState().pendingInvites;
      setPendingInvites(Math.max(0, currentCount - 1));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleRefresh = useCallback(async () => {
    await clearCachesExceptUnsyncedResults();
    await Promise.all([
      fetchData(false, true),
      loadPastGames?.(),
    ]);
  }, [fetchData, loadPastGames]);

  const { isRefreshing, pullDistance, pullProgress } = usePullToRefresh({
    onRefresh: handleRefresh,
    disabled: loading || loadingPastGames,
  });

  return (
    <>
      <RefreshIndicator
        isRefreshing={isRefreshing}
        pullDistance={pullDistance}
        pullProgress={pullProgress}
      />
      <div
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: pullDistance > 0 && !isRefreshing ? 'none' : 'transform 0.3s ease-out',
        }}
      >
        <div
          className={`transition-all duration-500 ease-in-out overflow-hidden ${
            !loading
              ? 'max-h-[2000px] opacity-100 translate-y-0'
              : 'max-h-0 opacity-0 -translate-y-4'
          }`}
        >
          <InvitesSection
            invites={invites}
            onAccept={handleAcceptInvite}
            onDecline={handleDeclineInvite}
            onNoteSaved={() => fetchData(false, true)}
          />
        </div>

        {invites.length > 0 && (activeTab === 'calendar' || activeTab === 'list') && (
          <>
            <Divider />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              {t('home.myGames')}
            </h2>
          </>
        )}

        <div className="relative min-h-[100px] overflow-hidden">
          <div
            className={`transition-all duration-300 ease-in-out ${
              activeTab === 'calendar'
                ? 'opacity-100 translate-x-0'
                : 'opacity-0 -translate-x-4 absolute inset-0 pointer-events-none overflow-hidden'
            }`}
          >
            <MonthCalendar
              selectedDate={myGamesSelectedDate}
              onDateSelect={setMyGamesSelectedDate}
              availableGames={filteredMyGames}
            />
            <MyGamesSection
              games={myGamesForSelectedDate}
              user={user}
              loading={loading}
              showSkeleton={skeletonAnimation.showSkeleton}
              skeletonStates={skeletonAnimation.skeletonStates}
              gamesUnreadCounts={mergedUnreadCounts}
              onNoteSaved={() => fetchData(false, true)}
            />
          </div>

          <div
            className={`transition-all duration-300 ease-in-out ${
              activeTab === 'list'
                ? 'opacity-100 translate-x-0'
                : 'opacity-0 -translate-x-4 absolute inset-0 pointer-events-none overflow-hidden'
            }`}
          >
            <MyGamesSection
              games={filteredMyGames}
              user={user}
              loading={loading}
              showSkeleton={skeletonAnimation.showSkeleton}
              skeletonStates={skeletonAnimation.skeletonStates}
              gamesUnreadCounts={mergedUnreadCounts}
              onNoteSaved={() => fetchData(false, true)}
            />
          </div>

          <div
            className={`transition-all duration-300 ease-in-out ${
              activeTab === 'past-games'
                ? 'opacity-100 translate-x-0'
                : 'opacity-0 translate-x-4 absolute inset-0 pointer-events-none overflow-hidden'
            }`}
          >
            <PastGamesSection
              pastGames={filteredPastGames}
              loadingPastGames={loadingPastGames}
              hasMorePastGames={hasMorePastGames}
              user={user}
              pastGamesUnreadCounts={pastGamesUnreadCounts}
              onLoadMore={loadPastGames}
              onNoteSaved={(gameId) => refetchGame(gameId)}
            />
          </div>
        </div>

        <div
          className={`transition-all duration-500 ease-in-out overflow-hidden ${
            unreadMessages > 0
              ? 'max-h-[100px] opacity-100 translate-y-0 mb-4'
              : 'max-h-0 opacity-0 -translate-y-4'
          }`}
        >
          <div className="flex items-center justify-center pt-4">
            <Button
              onClick={handleMarkAllAsRead}
              variant="primary"
              size="sm"
              disabled={isMarkingAllAsRead || unreadMessages === 0}
              className="animate-in slide-in-from-top-4 fade-in"
            >
              {isMarkingAllAsRead ? t('common.loading', { defaultValue: 'Loading...' }) : t('chat.markAllAsRead', { defaultValue: 'Mark all as read' })}
            </Button>
          </div>
        </div>
        <MainTabFooter isLoading={loading || loadingPastGames || isRefreshing} />
      </div>
    </>
  );
};
