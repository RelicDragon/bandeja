import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { MainLayout } from '@/layouts/MainLayout';
import { InvitesSection, MyGamesSection, PastGamesSection, AvailableGamesSection } from '@/components/home';
import { Divider } from '@/components';
import { invitesApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { useNavigationStore } from '../store/navigationStore';
import { useSkeletonAnimation } from '@/hooks/useSkeletonAnimation';
import { useHomeGames } from '@/hooks/useHomeGames';
import { usePastGames } from '@/hooks/usePastGames';

export const HomeContent = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);

  const [loading, setLoading] = useState(true);
  const [showChatFilter, setShowChatFilter] = useState(
    location.state?.showChatFilter || false
  );

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

  useEffect(() => {
    if (location.state?.showChatFilter) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname]);

  const handleAcceptInvite = async (inviteId: string) => {
    try {
      await invitesApi.accept(inviteId);
      setInvites(invites.filter((inv) => inv.id !== inviteId));
      fetchData(false);
    } catch (error) {
      console.error('Failed to accept invite:', error);
    }
  };

  const handleDeclineInvite = async (inviteId: string) => {
    try {
      await invitesApi.decline(inviteId);
      setInvites(invites.filter((inv) => inv.id !== inviteId));
    } catch (error) {
      console.error('Failed to decline invite:', error);
    }
  };

  const handleJoinGame = async (gameId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { gamesApi } = await import('@/api');
      await gamesApi.join(gameId);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to join game');
    }
  };

  return (
    <>
      {!loading && (
        <InvitesSection
          invites={invites}
          onAccept={handleAcceptInvite}
          onDecline={handleDeclineInvite}
        />
      )}

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

      {!loading && (
        <PastGamesSection
          pastGames={pastGames}
          showPastGames={showPastGames}
          loadingPastGames={loadingPastGames}
          hasMorePastGames={hasMorePastGames}
          user={user}
          onToggle={togglePastGames}
          onLoadMore={loadPastGames}
        />
      )}

      <Divider />

      <AvailableGamesSection
        availableGames={availableGames}
        user={user}
        loading={loading}
        onJoin={handleJoinGame}
      />
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