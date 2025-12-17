import { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { MainLayout } from '@/layouts/MainLayout';
import { InvitesSection, MyGamesSection, PastGamesSection, AvailableGamesSection, GamesTabController, Contacts, BugsSection } from '@/components/home';
import { Divider, Button } from '@/components';
import { Search, ChevronDown } from 'lucide-react';
import { chatApi } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';
import { useNavigationStore } from '../store/navigationStore';
import { useHeaderStore } from '@/store/headerStore';
import { useSkeletonAnimation } from '@/hooks/useSkeletonAnimation';
import { useMyGames } from '@/hooks/useMyGames';
import { usePastGames } from '@/hooks/usePastGames';
import { useAvailableGames } from '@/hooks/useAvailableGames';
import { useBugsWithUnread } from '@/hooks/useBugsWithUnread';
import { ChatType } from '@/types';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { enUS, ru, es, sr } from 'date-fns/locale';
import { useTranslation as useI18nTranslation } from 'react-i18next';

const sortGamesByStatusAndDateTime = <T extends { status?: string; startTime: string }>(list: T[] = []): T[] => {
  const getStatusPriority = (status?: string): number => {
    if (status === 'ANNOUNCED' || status === 'STARTED') return 0;
    if (status === 'FINISHED') return 1;
    if (status === 'ARCHIVED') return 2;
    return 3;
  };

  return [...list].sort((a, b) => {
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
  const { showChatFilter, setShowChatFilter } = useHeaderStore();

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
    loadAllGamesWithUnread,
  } = useMyGames(user, (loadingState) => setLoading(loadingState), {
    showSkeletonsAnimated: skeletonAnimation.showSkeletonsAnimated,
    hideSkeletonsAnimated: skeletonAnimation.hideSkeletonsAnimated,
  });

  const [activeTab, setActiveTab] = useState<'my-games' | 'past-games'>('my-games');
  
  const [isAvailableGamesExpanded, setIsAvailableGamesExpanded] = useState(false);
  const [isButtonPressed, setIsButtonPressed] = useState(false);
  const availableGamesSectionRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!loading) {
      setIsAvailableGamesExpanded(games.length === 0);
    }
  }, [games.length, loading]);

  useEffect(() => {
    if (isAvailableGamesExpanded && availableGamesSectionRef.current) {
      const timeout = setTimeout(() => {
        availableGamesSectionRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'end' 
        });
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [isAvailableGamesExpanded]);

  const {
    pastGames,
    loadingPastGames,
    hasMorePastGames,
    pastGamesUnreadCounts,
    loadPastGames,
    loadAllPastGamesWithUnread,
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

  const [showArchived, setShowArchived] = useState(true);

  const {
    availableGames,
    loading: loadingAvailableGames,
    fetchData: fetchAvailableGames,
  } = useAvailableGames(user, dateRange.startDate, dateRange.endDate, showArchived);

  const handleMonthChange = () => {
    // Keep for compatibility but not used for fetching
  };

  const handleDateRangeChange = (startDate: Date, endDate: Date) => {
    setDateRange({ startDate, endDate });
  };

  const {
    bugsWithUnread,
    bugsUnreadCounts,
    loadAllBugsWithUnread,
  } = useBugsWithUnread(user);

  const mergedGames = useMemo(() => {
    if (!showChatFilter) return games;
    
    const pastGamesWithUnread = pastGames.filter(game => (pastGamesUnreadCounts[game.id] || 0) > 0);
    const existingGameIds = new Set(games.map(g => g.id));
    const newPastGames = pastGamesWithUnread.filter(game => !existingGameIds.has(game.id));
    
    return [...games, ...newPastGames];
  }, [games, pastGames, pastGamesUnreadCounts, showChatFilter]);

  const mergedUnreadCounts = useMemo(() => {
    return { ...gamesUnreadCounts, ...pastGamesUnreadCounts };
  }, [gamesUnreadCounts, pastGamesUnreadCounts]);

  const filteredMyGames = useMemo(() => {
    if (!showChatFilter) {
      return sortGamesByStatusAndDateTime(mergedGames);
    }
    
    const filtered = mergedGames.filter((game) => (mergedUnreadCounts[game.id] || 0) > 0);
    return sortGamesByStatusAndDateTime(filtered);
  }, [mergedGames, mergedUnreadCounts, showChatFilter]);
  
  const filteredPastGames = useMemo(() => sortGamesByStatusAndDateTime(pastGames), [pastGames]);
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
    
    if (participant?.isPlaying) {
      availableChatTypes.push('PRIVATE');
    }
    
    if (participant && (participant.role === 'OWNER' || participant.role === 'ADMIN')) {
      availableChatTypes.push('ADMINS');
    }
    
    return availableChatTypes;
  };

  const handleMarkAllAsRead = async () => {
    if (!user?.id || isMarkingAllAsRead) return;

    setIsMarkingAllAsRead(true);
    try {
      const allChatGamesResponse = await chatApi.getUserChatGames();
      const allChatGames = allChatGamesResponse.data;
      
      if (allChatGames.length === 0) {
        setIsMarkingAllAsRead(false);
        return;
      }

      const gameIds = allChatGames.map(game => game.id);
      const unreadCounts = await chatApi.getGamesUnreadCounts(gameIds);
      
      const gamesWithUnread = allChatGames.filter(game => (unreadCounts.data[game.id] || 0) > 0);
      
      const bugsWithUnreadMessages = bugsWithUnread.filter(bug => (bugsUnreadCounts[bug.id] || 0) > 0);
      
      if (gamesWithUnread.length === 0 && bugsWithUnreadMessages.length === 0) {
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

      await Promise.all([...markPromises, ...bugMarkPromises]);

      const { setUnreadMessages } = useHeaderStore.getState();
      setUnreadMessages(0);

      await fetchData(false, true);
      
      if (showChatFilter) {
        await Promise.all([
          loadAllGamesWithUnread?.(),
          loadAllPastGamesWithUnread?.(),
          loadAllBugsWithUnread?.()
        ]);
      }

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
      await invitesApi.accept(inviteId);
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
      Promise.resolve().then(() => {
        fetchData(false, true);
        fetchAvailableGames(true);
      });
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleJoinGame = async (gameId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { gamesApi } = await import('@/api');
      await gamesApi.join(gameId);
      fetchData(false, true);
      fetchAvailableGames(true);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const hasUnreadMessages = useMemo(() => {
    const gamesHaveUnread = Object.values(mergedUnreadCounts).some(count => count > 0);
    const bugsHaveUnread = Object.values(bugsUnreadCounts).some(count => count > 0);
    return gamesHaveUnread || bugsHaveUnread;
  }, [mergedUnreadCounts, bugsUnreadCounts]);

  return (
    <>
      <Contacts />

      <div
        className={`transition-all duration-500 ease-in-out overflow-hidden ${
          showChatFilter && hasUnreadMessages
            ? 'max-h-[100px] opacity-100 translate-y-0 mb-4'
            : 'max-h-0 opacity-0 -translate-y-4'
        }`}
      >
        <div className="flex items-center justify-center">
          <Button
            onClick={handleMarkAllAsRead}
            variant="primary"
            size="sm"
            disabled={isMarkingAllAsRead || !hasUnreadMessages}
            className="animate-in slide-in-from-top-4 fade-in"
          >
            {isMarkingAllAsRead ? t('common.loading', { defaultValue: 'Loading...' }) : t('chat.markAllAsRead', { defaultValue: 'Mark all as read' })}
          </Button>
        </div>
      </div>

      <div
        className={`transition-all duration-500 ease-in-out overflow-hidden ${
          !loading && !showChatFilter
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

      {!showChatFilter && (
        <GamesTabController
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      )}

      <div className="relative min-h-[200px]">
        {showChatFilter ? (
          <>
            <MyGamesSection
              games={filteredMyGames}
              user={user}
              loading={loading}
              showSkeleton={skeletonAnimation.showSkeleton}
              skeletonStates={skeletonAnimation.skeletonStates}
              showChatFilter={showChatFilter}
              gamesUnreadCounts={mergedUnreadCounts}
              onShowAllGames={() => setShowChatFilter(false)}
            />
            {bugsWithUnread.length > 0 && (
              <BugsSection
                bugs={bugsWithUnread}
                bugsUnreadCounts={bugsUnreadCounts}
              />
            )}
          </>
        ) : (
          <>
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
                showChatFilter={showChatFilter}
                gamesUnreadCounts={mergedUnreadCounts}
                onShowAllGames={() => setShowChatFilter(false)}
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
          </>
        )}
      </div>

      {!showChatFilter && (
        <>
          <Divider className="mt-2" />
          <div 
            className="flex justify-center -mt-9 cursor-pointer"
            onClick={() => setIsAvailableGamesExpanded(!isAvailableGamesExpanded)}
            onMouseDown={() => setIsButtonPressed(true)}
            onMouseUp={() => setIsButtonPressed(false)}
            onMouseLeave={() => setIsButtonPressed(false)}
            onTouchStart={() => setIsButtonPressed(true)}
            onTouchEnd={() => setIsButtonPressed(false)}
          >
            <p className={`text-xs text-gray-500 dark:text-gray-400 text-center px-3 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 flex items-center gap-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-transform duration-300 ease-[cubic-bezier(0.68,-0.55,0.265,1.55)] ${
              isButtonPressed ? 'scale-[1.5]' : 'scale-100'
            }`}>
              <Search className="w-3 h-3" />
              {t('home.findGames', { defaultValue: 'Find games' })}
              <ChevronDown 
                className={`w-3 h-3 transition-transform duration-300 ${
                  isAvailableGamesExpanded ? 'rotate-180' : ''
                }`}
              />
            </p>
          </div>
          <div
            ref={availableGamesSectionRef}
            className={`transition-all duration-300 ease-in-out overflow-hidden ${
              isAvailableGamesExpanded
                ? 'max-h-[5000px] opacity-100'
                : 'max-h-0 opacity-0'
            }`}
          >
            <AvailableGamesSection
              availableGames={filteredAvailableGames}
              user={user}
              loading={loadingAvailableGames}
              onJoin={handleJoinGame}
              onMonthChange={handleMonthChange}
              onDateRangeChange={handleDateRangeChange}
              showArchived={showArchived}
              onShowArchivedChange={setShowArchived}
            />
          </div>
        </>
      )}

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
    </>
  );
};

export const Home = () => {
  const { currentPage, isAnimating } = useNavigationStore();

  return (
    <MainLayout>
      <div className={`transition-all duration-300 ease-in-out ${
        currentPage === 'home' && !isAnimating 
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