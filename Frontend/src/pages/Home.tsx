import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { MainLayout } from '@/layouts/MainLayout';
import { InvitesSection, MyGamesSection, PastGamesSection, AvailableGamesSection } from '@/components/home';
import { Divider, Button } from '@/components';
import { invitesApi } from '@/api';
import { chatApi } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';
import { useNavigationStore } from '../store/navigationStore';
import { useHeaderStore } from '@/store/headerStore';
import { useSkeletonAnimation } from '@/hooks/useSkeletonAnimation';
import { useHomeGames } from '@/hooks/useHomeGames';
import { usePastGames } from '@/hooks/usePastGames';
import { ChatType } from '@/types';

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

  const {
    pastGames,
    loadingPastGames,
    showPastGames,
    hasMorePastGames,
    pastGamesUnreadCounts,
    loadPastGames,
    togglePastGames,
    loadAllPastGamesWithUnread,
  } = usePastGames(user);

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

  const [isMarkingAllAsRead, setIsMarkingAllAsRead] = useState(false);

  const getAvailableChatTypes = (game: any): ChatType[] => {
    const availableChatTypes: ChatType[] = ['PUBLIC'];
    const participant = game.participants?.find((p: any) => p.userId === user?.id);
    
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
      
      if (gamesWithUnread.length === 0) {
        setIsMarkingAllAsRead(false);
        return;
      }

      const markPromises = gamesWithUnread.map(game => {
        const chatTypes = getAvailableChatTypes(game);
        return chatApi.markAllMessagesAsRead(game.id, chatTypes);
      });

      await Promise.all(markPromises);

      const { setUnreadMessages } = useHeaderStore.getState();
      setUnreadMessages(0);

      await fetchData(false, true);
      
      if (showChatFilter) {
        await Promise.all([
          loadAllGamesWithUnread?.(),
          loadAllPastGamesWithUnread?.()
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

  const hasUnreadMessages = Object.values(mergedUnreadCounts).some(count => count > 0);

  return (
    <>
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

      <MyGamesSection
        games={mergedGames}
        user={user}
        loading={loading}
        showSkeleton={skeletonAnimation.showSkeleton}
        skeletonStates={skeletonAnimation.skeletonStates}
        showChatFilter={showChatFilter}
        gamesUnreadCounts={mergedUnreadCounts}
        onShowAllGames={() => setShowChatFilter(false)}
      />

      <div
        className={`transition-all duration-500 ease-in-out overflow-hidden ${
          !loading && !showChatFilter
            ? 'max-h-[2000px] opacity-100 translate-y-0'
            : 'max-h-0 opacity-0 -translate-y-4'
        }`}
      >
        <PastGamesSection
          pastGames={pastGames}
          showPastGames={showPastGames}
          loadingPastGames={loadingPastGames}
          hasMorePastGames={hasMorePastGames}
          user={user}
          pastGamesUnreadCounts={pastGamesUnreadCounts}
          onToggle={togglePastGames}
          onLoadMore={loadPastGames}
        />
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
          availableGames={availableGames}
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