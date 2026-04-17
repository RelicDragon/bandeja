import { useEffect, useState, useCallback, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { usersApi, UserStats } from '@/api/users';
import { favoritesApi } from '@/api/favorites';
import { blockedUsersApi } from '@/api/blockedUsers';
import { Loading } from '@/components/Loading';
import { FullscreenImageViewer } from '@/components/FullscreenImageViewer';
import { PlayerAvatarView } from '@/components/PlayerAvatarView';
import { ReviewsList } from '@/components/ReviewsList';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { ShareModal } from '@/components/ShareModal';
import { PublicGamePrompt } from '@/components/GameDetails/PublicGamePrompt';
import { useAuthStore } from '@/store/authStore';
import { useFavoritesStore } from '@/store/favoritesStore';
import { usePlayersStore } from '@/store/playersStore';
import { usePresenceStore } from '@/store/presenceStore';
import { useNavigationStore } from '@/store/navigationStore';
import { usePresenceSubscription } from '@/hooks/usePresenceSubscription';
import { useBackButtonHandler } from '@/hooks/useBackButtonHandler';
import { handleBack } from '@/utils/backNavigation';
import toast from 'react-hot-toast';
import { sharePlayerProfile } from '@/utils/sharePlayerProfile';
import { PlayerCardProfileBody } from '@/components/player/PlayerCardProfileBody';
import { PlayerProfileActionBar } from '@/components/player/PlayerProfileActionBar';

export const UserProfilePage = () => {
  const { userId } = useParams<{ userId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const { addFavorite, removeFavorite } = useFavoritesStore();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAvatarView, setShowAvatarView] = useState(false);
  const [showReviewsView, setShowReviewsView] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const [showBlockConfirmation, setShowBlockConfirmation] = useState(false);
  const [blockingUser, setBlockingUser] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareModalUrl, setShareModalUrl] = useState('');
  const [avatarViewerUrl, setAvatarViewerUrl] = useState<string | null>(null);
  const isCurrentUser = !!(user && userId && user.id === userId);
  const showTelegram = !!user;

  useBackButtonHandler();

  useEffect(() => {
    const { setBottomTabsVisible } = useNavigationStore.getState();
    setBottomTabsVisible(false);
    return () => setBottomTabsVisible(true);
  }, []);

  useEffect(() => {
    if (!userId) return;
    setShowAvatarView(false);
    setShowReviewsView(false);
    setShowShareModal(false);
    setShareModalUrl('');
    setAvatarViewerUrl(null);

    const fetchStats = async () => {
      try {
        setLoading(true);
        const statsResponse = await usersApi.getUserStats(userId);
        setStats(statsResponse.data);
        if (user && user.id !== userId) {
          const blocked = await blockedUsersApi.checkIfUserBlocked(userId);
          setIsBlocked(blocked);
        } else {
          setIsBlocked(false);
        }
      } catch (error) {
        console.error('Failed to fetch user stats:', error);
        setStats(null);
      } finally {
        setLoading(false);
      }
    };

    void fetchStats();
  }, [userId, user]);

  usePresenceSubscription('user-profile-page', user && userId && !isCurrentUser ? [userId] : []);

  useEffect(() => {
    if (!user || !userId || isCurrentUser) return;
    usersApi.getPresence([userId]).then((data) => {
      if (Object.keys(data).length > 0) usePresenceStore.getState().setPresenceInitial(data);
    }).catch(() => {});
  }, [userId, isCurrentUser, user]);

  const handleToggleFavorite = useCallback(async () => {
    if (!userId || !stats || isBlocked) return;
    try {
      if (stats.user.isFavorite) {
        await favoritesApi.removeUserFromFavorites(userId);
        setStats({ ...stats, user: { ...stats.user, isFavorite: false }, followersCount: Math.max(0, stats.followersCount - 1) });
        removeFavorite(userId);
        toast.success(t('favorites.userRemovedFromFavorites'));
      } else {
        await favoritesApi.addUserToFavorites(userId);
        setStats({ ...stats, user: { ...stats.user, isFavorite: true }, followersCount: stats.followersCount + 1 });
        addFavorite(userId);
        toast.success(t('favorites.userAddedToFavorites'));
      }
    } catch (error: unknown) {
      const errorMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  }, [userId, stats, isBlocked, t, removeFavorite, addFavorite]);

  const handleStartChat = useCallback(async () => {
    if (!userId || startingChat || isBlocked) return;
    setStartingChat(true);
    try {
      const chat = await usePlayersStore.getState().getOrCreateAndAddUserChat(userId);
      if (!chat) {
        toast.error(t('errors.generic', { defaultValue: 'Something went wrong' }));
        return;
      }
      navigate(`/user-chat/${chat.id}`, {
        state: { chat, contextType: 'USER' },
      });
    } catch (error: unknown) {
      const errorMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setStartingChat(false);
    }
  }, [userId, startingChat, isBlocked, navigate, t]);

  const handleShareProfile = useCallback(async () => {
    if (!userId || !stats || isBlocked) return;
    const displayName = `${stats.user.firstName || ''} ${stats.user.lastName || ''}`.trim() || t('playerCard.shareProfileFallbackName');
    await sharePlayerProfile({
      playerId: userId,
      displayName,
      t,
      onFallbackModal: (url) => {
        setShareModalUrl(url);
        setShowShareModal(true);
      },
    });
  }, [userId, stats, isBlocked, t]);

  const handleBlockUser = useCallback(async () => {
    if (!userId || blockingUser) return;
    setBlockingUser(true);
    try {
      if (isBlocked) {
        await blockedUsersApi.unblockUser(userId);
        setIsBlocked(false);
        toast.success(t('playerCard.userUnblocked') || 'User unblocked');
      } else {
        await blockedUsersApi.blockUser(userId);
        setIsBlocked(true);
        toast.success(t('playerCard.userBlocked') || 'User blocked');
        handleBack(navigate);
      }
      try {
        const profileResponse = await usersApi.getProfile();
        updateUser(profileResponse.data);
      } catch (error) {
        console.error('Failed to refresh user profile after block/unblock:', error);
      }
    } catch (error: unknown) {
      const errorMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setBlockingUser(false);
      setShowBlockConfirmation(false);
    }
  }, [userId, blockingUser, isBlocked, navigate, t, updateUser]);

  const setUserProfileHeaderActions = useNavigationStore((s) => s.setUserProfileHeaderActions);
  const actionBarVisible =
    !!(user && userId && user.id !== userId && stats && !showReviewsView && !(showAvatarView && stats.user.originalAvatar) && !avatarViewerUrl);

  useLayoutEffect(() => {
    if (!userId || (user && user.id === userId)) {
      setUserProfileHeaderActions(null);
      return () => setUserProfileHeaderActions(null);
    }
    if (!actionBarVisible || !stats) {
      setUserProfileHeaderActions(null);
      return () => setUserProfileHeaderActions(null);
    }
    setUserProfileHeaderActions(
      <PlayerProfileActionBar
        variant="header"
        stats={stats}
        isCurrentUser={false}
        isBlocked={isBlocked}
        blockingUser={blockingUser}
        startingChat={startingChat}
        onToggleFavorite={handleToggleFavorite}
        onShare={() => void handleShareProfile()}
        onStartChat={handleStartChat}
        onBlockPrimary={isBlocked ? handleBlockUser : () => setShowBlockConfirmation(true)}
        t={t}
      />
    );
    return () => setUserProfileHeaderActions(null);
  }, [
    userId,
    user,
    actionBarVisible,
    stats,
    isBlocked,
    blockingUser,
    startingChat,
    t,
    handleToggleFavorite,
    handleStartChat,
    handleShareProfile,
    handleBlockUser,
    setUserProfileHeaderActions,
    avatarViewerUrl,
  ]);

  if (!userId) {
    return null;
  }

  if (user && user.id === userId) {
    return <Navigate to="/profile" replace />;
  }

  const publicNav = !user ? (
    <div
      className="sticky top-0 z-20 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => handleBack(navigate)}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
          {t('playerProfile.pageTitle')}
        </h1>
      </div>
    </div>
  ) : null;

  return (
    <div className={user ? 'w-full min-h-0' : 'max-w-2xl mx-auto min-h-0'}>
      {publicNav}

      {user && stats && !showReviewsView && showAvatarView && stats.user.originalAvatar && (
        <div className="flex items-center justify-between w-full p-2 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => setShowAvatarView(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
            </button>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate">{`${stats.user.firstName || ''} ${stats.user.lastName || ''}`.trim()}</h2>
          </div>
          <button type="button" onClick={() => handleBack(navigate)} className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
            <X size={20} className="text-gray-600 dark:text-gray-300" />
          </button>
        </div>
      )}

      {user && showReviewsView && userId && (
        <div className="flex items-center justify-between w-full p-2 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => setShowReviewsView(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
            </button>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate">{t('profile.review') || 'Reviews'}</h2>
          </div>
          <button type="button" onClick={() => handleBack(navigate)} className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
            <X size={20} className="text-gray-600 dark:text-gray-300" />
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="loading" className="flex items-center justify-center h-64" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <Loading />
          </motion.div>
        ) : showReviewsView && userId && stats ? (
          <motion.div
            key="reviews"
            className="flex flex-col px-0 pb-4 overflow-y-auto"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <ReviewsList
              trainerId={userId}
              initialSummary={{ rating: stats.user.trainerRating ?? null, reviewCount: stats.user.trainerReviewCount ?? 0 }}
              onReviewClick={(gameId) => navigate(`/games/${gameId}`)}
              showSummary
              showTitle={false}
              compact
            />
          </motion.div>
        ) : stats ? (
          <>
            {!user && showAvatarView && stats.user.originalAvatar ? (
              <motion.div key="avatar" className="flex flex-col" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3, ease: 'easeInOut' }}>
                <PlayerAvatarView stats={stats} />
              </motion.div>
            ) : (
              <motion.div key="content" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
                <PlayerCardProfileBody
                  stats={stats}
                  t={t}
                  isBlocked={isBlocked}
                  showTelegram={showTelegram}
                  edgeToEdge={!!user}
                  prependBeforeLevelHistory={!user ? <PublicGamePrompt variant="profile" /> : undefined}
                  onAvatarClick={() => {
                    if (!stats.user.originalAvatar) return;
                    if (user) setAvatarViewerUrl(stats.user.originalAvatar);
                    else setShowAvatarView(true);
                  }}
                  onRatingClick={user && stats.user.isTrainer && (stats.user.trainerReviewCount ?? 0) > 0 ? () => setShowReviewsView(true) : undefined}
                  onTelegramClick={() => {
                    const getTelegramUrl = () => {
                      if (stats.user.telegramUsername) return `https://t.me/${stats.user.telegramUsername.replace('@', '')}`;
                      if (stats.user.telegramId) return `tg://user?id=${stats.user.telegramId}`;
                      return null;
                    };
                    const telegramUrl = getTelegramUrl();
                    if (telegramUrl && !isBlocked) window.open(telegramUrl, '_blank');
                  }}
                  onOpenGame={() => {}}
                  onMarketItemClick={user
                    ? (item) => navigate(`/marketplace/${item.id}`)
                    : () => navigate('/login')}
                />
              </motion.div>
            )}
          </>
        ) : (
          <motion.div key="empty" className="p-8 text-center text-gray-600 dark:text-gray-400">
            {t('errors.generic', { defaultValue: 'Something went wrong' })}
          </motion.div>
        )}
      </AnimatePresence>

      <ShareModal
        isOpen={showShareModal}
        onClose={() => { setShowShareModal(false); setShareModalUrl(''); }}
        shareUrl={shareModalUrl}
        dialogTitle={t('playerCard.shareProfileTitle')}
        modalId="share-modal-user-profile"
      />

      {avatarViewerUrl && (
        <FullscreenImageViewer
          imageUrl={avatarViewerUrl}
          isOpen
          onClose={() => setAvatarViewerUrl(null)}
        />
      )}

      {showBlockConfirmation && stats && !isBlocked && userId && (
        <ConfirmationModal
          isOpen={showBlockConfirmation}
          title={t('playerCard.blockUser')}
          message={t('playerCard.blockUserConfirmation', { name: stats.user.firstName || '' }) || `Are you sure you want to block ${stats.user.firstName || ''}? You won't be able to see their messages or interact with them.`}
          confirmText={t('playerCard.block')}
          cancelText={t('common.cancel')}
          confirmVariant="danger"
          onConfirm={handleBlockUser}
          onClose={() => setShowBlockConfirmation(false)}
        />
      )}
    </div>
  );
};
