import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { MainLayout } from '@/layouts/MainLayout';
import { InvitesSection, MyGamesSection, PastGamesSection, AvailableGamesSection } from '@/components/home';
import { Divider } from '@/components';
import { invitesApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { useNavigationStore } from '../store/navigationStore';
import { useHeaderStore } from '@/store/headerStore';
import { useSkeletonAnimation } from '@/hooks/useSkeletonAnimation';
import { useHomeGames } from '@/hooks/useHomeGames';
import { usePastGames } from '@/hooks/usePastGames';

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
  } = useHomeGames(user, (loadingState) => setLoading(loadingState), {
    showSkeletonsAnimated: skeletonAnimation.showSkeletonsAnimated,
    hideSkeletonsAnimated: skeletonAnimation.hideSkeletonsAnimated,
  });

  const {
    pastGames,
    loadingPastGames,
    showPastGames,
    hasMorePastGames,
    loadPastGames,
    togglePastGames,
  } = usePastGames(user);


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

  return (
    <>
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
        games={games}
        user={user}
        loading={loading}
        showSkeleton={skeletonAnimation.showSkeleton}
        skeletonStates={skeletonAnimation.skeletonStates}
        showChatFilter={showChatFilter}
        gamesUnreadCounts={gamesUnreadCounts}
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