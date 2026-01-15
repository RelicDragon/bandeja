import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { MainLayout } from '@/layouts/MainLayout';
import { InvitesSection, MyGamesSection, PastGamesSection, AvailableGamesSection } from '@/components/home';
import { Button } from '@/components';
import { RefreshIndicator } from '@/components/RefreshIndicator';
import { chatApi } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';
import { useNavigationStore } from '../store/navigationStore';
import { useHeaderStore } from '@/store/headerStore';
import { useSkeletonAnimation } from '@/hooks/useSkeletonAnimation';
import { useMyGames } from '@/hooks/useMyGames';
import { usePastGames } from '@/hooks/usePastGames';
import { useAvailableGames } from '@/hooks/useAvailableGames';
import { ChatType } from '@/types';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { enUS, ru, es, sr } from 'date-fns/locale';
import { useTranslation as useI18nTranslation } from 'react-i18next';
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

export const HomeContent = () => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const { unreadMessages } = useHeaderStore();

  const [loading, setLoading] = useState(true);
  const [isLogoAnimating, setIsLogoAnimating] = useState(false);

  const handleLogoClick = () => {
    setIsLogoAnimating(true);
    setTimeout(() => setIsLogoAnimating(false), 1200);
  };

  const skeletonAnimation = useSkeletonAnimation();
  
  const {
    games,
    invites,
    gamesUnreadCounts,
    setInvites,
    fetchData,
  } = useMyGames(user, (loadingState) => setLoading(loadingState), {
    showSkeletonsAnimated: skeletonAnimation.showSkeletonsAnimated,
    hideSkeletonsAnimated: skeletonAnimation.hideSkeletonsAnimated,
  });

  const { activeTab, setActiveTab } = useNavigationStore();

  useEffect(() => {
    if (!loading && games.length === 0 && activeTab === 'my-games') {
      setActiveTab('search');
    }
  }, [loading, games.length, activeTab, setActiveTab]);

  const {
    pastGames,
    loadingPastGames,
    hasMorePastGames,
    pastGamesUnreadCounts,
    loadPastGames,
  } = usePastGames(user, activeTab === 'past-games');

  const { i18n } = useI18nTranslation();
  const localeMap = { en: enUS, ru: ru, es: es, sr: sr };
  const locale = localeMap[i18n.language as keyof typeof localeMap] || enUS;

  const [dateRange, setDateRange] = useState<{ startDate?: Date; endDate?: Date }>(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const start = startOfWeek(monthStart, { locale });
    const end = endOfWeek(monthEnd, { locale });
    return { startDate: start, endDate: end };
  });

  const {
    availableGames,
    loading: loadingAvailableGames,
    fetchData: fetchAvailableGames,
  } = useAvailableGames(user, dateRange.startDate, dateRange.endDate);

  const handleMonthChange = () => {
    // Keep for compatibility but not used for fetching
  };

  const handleDateRangeChange = (startDate: Date, endDate: Date) => {
    setDateRange({ startDate, endDate });
  };


  const mergedGames = games;

  const mergedUnreadCounts = useMemo(() => {
    return { ...gamesUnreadCounts, ...pastGamesUnreadCounts };
  }, [gamesUnreadCounts, pastGamesUnreadCounts]);

  const filteredMyGames = useMemo(() => {
    return sortGamesByStatusAndDateTime(mergedGames, mergedUnreadCounts);
  }, [mergedGames, mergedUnreadCounts]);
  
  const filteredPastGames = useMemo(() => sortGamesByStatusAndDateTime(pastGames, pastGamesUnreadCounts), [pastGames, pastGamesUnreadCounts]);
  const filteredAvailableGames = useMemo(() => sortGamesByStatusAndDateTime(availableGames), [availableGames]);

  const [isMarkingAllAsRead, setIsMarkingAllAsRead] = useState(false);

  const getAvailableChatTypes = (game: any): ChatType[] => {
    const availableChatTypes: ChatType[] = [];
    const participant = game.participants?.find((p: any) => p.userId === user?.id);
    
    // Add PHOTOS first if game status != ANNOUNCED (available for everyone like PUBLIC)
    if (game.status && game.status !== 'ANNOUNCED') {
      availableChatTypes.push('PHOTOS');
    }
    
    availableChatTypes.push('PUBLIC');
    
    if (participant && (participant.role === 'OWNER' || participant.role === 'ADMIN')) {
      availableChatTypes.push('ADMINS');
    }
    
    return availableChatTypes;
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

      const bugMarkPromises = bugsWithUnreadMessages.map(bug => 
        chatApi.markAllBugMessagesAsRead(bug.id)
      );

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
        fetchAvailableGames(true);
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
      fetchAvailableGames(true);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleJoinGame = async (gameId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { gamesApi } = await import('@/api');
      const response = await gamesApi.join(gameId);
      const message = (response as any).message || 'Successfully joined the game';
      
      if (message === 'games.addedToJoinQueue') {
        toast.success(t('games.addedToJoinQueue', { defaultValue: 'Added to join queue' }));
      } else {
        toast.success(t(message, { defaultValue: message }));
      }
      
      fetchData(false, true);
      fetchAvailableGames(true);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleRefresh = useCallback(async () => {
    await clearCachesExceptUnsyncedResults();
    await Promise.all([
      fetchData(false, true),
      fetchAvailableGames(true),
      loadPastGames?.(),
    ]);
  }, [fetchData, fetchAvailableGames, loadPastGames]);

  const { isRefreshing, pullDistance, pullProgress } = usePullToRefresh({
    onRefresh: handleRefresh,
    disabled: loading || loadingAvailableGames || loadingPastGames,
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
        />
      </div>


      <div className="relative min-h-[100px]">
        <div
          className={`transition-all duration-300 ease-in-out ${
            activeTab === 'my-games'
              ? 'opacity-100 translate-x-0'
              : 'opacity-0 -translate-x-4 absolute inset-0 pointer-events-none'
          }`}
        >
          <MyGamesSection
            games={filteredMyGames}
            user={user}
            loading={loading}
            showSkeleton={skeletonAnimation.showSkeleton}
            skeletonStates={skeletonAnimation.skeletonStates}
            gamesUnreadCounts={mergedUnreadCounts}
            onSwitchToSearch={() => setActiveTab('search')}
          />
        </div>

            <div
              className={`transition-all duration-300 ease-in-out ${
                activeTab === 'past-games'
                  ? 'opacity-100 translate-x-0'
                  : 'opacity-0 translate-x-4 absolute inset-0 pointer-events-none'
              }`}
            >
              <PastGamesSection
                pastGames={filteredPastGames}
                loadingPastGames={loadingPastGames}
                hasMorePastGames={hasMorePastGames}
                user={user}
                pastGamesUnreadCounts={pastGamesUnreadCounts}
                onLoadMore={loadPastGames}
              />
            </div>

        <div
          className={`transition-all duration-300 ease-in-out ${
            activeTab === 'search'
              ? 'opacity-100 translate-x-0'
              : 'opacity-0 translate-x-4 absolute inset-0 pointer-events-none'
          }`}
        >
          <AvailableGamesSection
            availableGames={filteredAvailableGames}
            user={user}
            loading={loadingAvailableGames}
            onJoin={handleJoinGame}
            onMonthChange={handleMonthChange}
            onDateRangeChange={handleDateRangeChange}
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

      <div className="flex justify-center mt-4">
        <style>{`
          @keyframes logoBounce {
            0% { transform: rotate(0deg) scale(1); }
            10% { transform: rotate(15deg) scale(1.15); }
            20% { transform: rotate(0deg) scale(1); }
            30% { transform: rotate(10deg) scale(1.1); }
            40% { transform: rotate(0deg) scale(1); }
            50% { transform: rotate(6deg) scale(1.06); }
            60% { transform: rotate(0deg) scale(1); }
            70% { transform: rotate(3deg) scale(1.03); }
            80% { transform: rotate(0deg) scale(1); }
            90% { transform: rotate(1deg) scale(1.01); }
            100% { transform: rotate(0deg) scale(1); }
          }
          .logo-bounce {
            animation: logoBounce 1.2s ease-out;
          }
        `}</style>
        <img 
          src="/bandeja-blue-flat-small.png" 
          alt="Bandeja Logo" 
          className={`h-24 cursor-pointer select-none ${isLogoAnimating ? 'logo-bounce' : ''}`}
          onClick={handleLogoClick}
        />
      </div>
      </div>
    </>
  );
};

export const Home = () => {
  const { currentPage, isAnimating } = useNavigationStore();

  return (
    <MainLayout>
      <div className={`transition-all duration-300 ease-in-out ${
        currentPage === 'my' && !isAnimating 
          ? 'opacity-100 transform translate-x-0' 
          : currentPage === 'profile' 
            ? 'opacity-0 transform -translate-x-full' 
            : 'opacity-100 transform translate-x-0'
      }`}>
        <HomeContent />
      </div>
    </MainLayout>
  );
};