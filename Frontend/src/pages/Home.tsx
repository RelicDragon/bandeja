import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { MainLayout } from '@/layouts/MainLayout';
import { InvitesSection, MyGamesSection, PastGamesSection, AvailableGamesSection, GamesTabController, Contacts, BugsSection } from '@/components/home';
import { Divider, Button } from '@/components';
import { invitesApi } from '@/api';
import { chatApi } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';
import { useNavigationStore } from '../store/navigationStore';
import { useHeaderStore } from '@/store/headerStore';
import { useSkeletonAnimation } from '@/hooks/useSkeletonAnimation';
import { useHomeGames } from '@/hooks/useHomeGames';
import { usePastGames } from '@/hooks/usePastGames';
import { useBugsWithUnread } from '@/hooks/useBugsWithUnread';
import { ChatType } from '@/types';

const filterGamesByTime = <T extends { timeIsSet?: boolean }>(list: T[] = []) =>
  list.filter((game) => game.timeIsSet !== false);

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

  const skeletonAnimation = useSkeletonAnimation();
  
  const {
    games,
    availableGames,
    invites,
    gamesUnreadCounts,
    setInvites,
    fetchData,
    loadAllGamesWithUnread,
  } = useHomeGames(user, (loadingState) => setLoading(loadingState), {
    showSkeletonsAnimated: skeletonAnimation.showSkeletonsAnimated,
    hideSkeletonsAnimated: skeletonAnimation.hideSkeletonsAnimated,
  });

  const [activeTab, setActiveTab] = useState<'my-games' | 'past-games'>('my-games');

  const {
    pastGames,
    loadingPastGames,
    hasMorePastGames,
    pastGamesUnreadCounts,
    loadPastGames,
    loadAllPastGamesWithUnread,
  } = usePastGames(user, activeTab === 'past-games');

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

  const filteredMyGames = useMemo(() => sortGamesByStatusAndDateTime(filterGamesByTime(mergedGames)), [mergedGames]);
  const filteredPastGames = useMemo(() => sortGamesByStatusAndDateTime(filterGamesByTime(pastGames)), [pastGames]);
  const filteredAvailableGames = useMemo(() => sortGamesByStatusAndDateTime(filterGamesByTime(availableGames)), [availableGames]);

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
      await invitesApi.accept(inviteId);
      setInvites(invites.filter((inv) => inv.id !== inviteId));
      // Update header store to decrement pending invites count
      const { setPendingInvites } = useHeaderStore.getState();
      const currentCount = useHeaderStore.getState().pendingInvites;
      setPendingInvites(Math.max(0, currentCount - 1));
      // Defer fetchData to next event loop tick to ensure backend processing is complete
      Promise.resolve().then(() => fetchData(false, true));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleDeclineInvite = async (inviteId: string) => {
    try {
      await invitesApi.decline(inviteId);
      setInvites(invites.filter((inv) => inv.id !== inviteId));
      // Update header store to decrement pending invites count
      const { setPendingInvites } = useHeaderStore.getState();
      const currentCount = useHeaderStore.getState().pendingInvites;
      setPendingInvites(Math.max(0, currentCount - 1));
      // Defer fetchData to next event loop tick to ensure backend processing is complete
      Promise.resolve().then(() => fetchData(false, true));
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

      <div
        className={`transition-all duration-500 ease-in-out overflow-hidden ${
          !showChatFilter
            ? 'max-h-[50px] opacity-100 translate-y-0'
            : 'max-h-0 opacity-0 -translate-y-4'
        }`}
      >
        <Divider />
      </div>

      <div
        className={`transition-all duration-500 ease-in-out overflow-hidden ${
          !showChatFilter
            ? 'max-h-[5000px] opacity-100 translate-y-0'
            : 'max-h-0 opacity-0 -translate-y-4'
        }`}
      >
        <AvailableGamesSection
          availableGames={filteredAvailableGames}
          user={user}
          loading={loading}
          onJoin={handleJoinGame}
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