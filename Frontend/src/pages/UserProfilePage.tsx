import { useEffect, useState, useLayoutEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, Navigate, useSearchParams } from 'react-router-dom';
import { Loading } from '@/components/Loading';
import { FullscreenImageViewer } from '@/components/FullscreenImageViewer';
import { PlayerAvatarView } from '@/components/PlayerAvatarView';
import { ReviewsList } from '@/components/ReviewsList';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { ShareModal } from '@/components/ShareModal';
import { PublicGamePrompt } from '@/components/GameDetails/PublicGamePrompt';
import { useAuthStore } from '@/store/authStore';
import { useShellNavStore } from '@/store/shellNavStore';
import { useBackButtonHandler } from '@/hooks/useBackButtonHandler';
import { handleBack } from '@/utils/backNavigation';
import { PlayerCardProfileBody, type PlayerCardProfileTab } from '@/components/player/PlayerCardProfileBody';
import { PlayerProfileActionBar } from '@/components/player/PlayerProfileActionBar';
import { SportLevelProvider } from '@/contexts/SportLevelContext';
import { parseLevelSportQuery } from '@/utils/levelSportQuery';
import { usePlayerProfile } from '@/features/playerProfile';
import { resolveActivePrimarySport } from '@/utils/profileSports';
import type { Sport } from '@shared/sport';

export const UserProfilePage = () => {
  const { userId } = useParams<{ userId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [showAvatarView, setShowAvatarView] = useState(false);
  const [showReviewsView, setShowReviewsView] = useState(false);
  const [showBlockConfirmation, setShowBlockConfirmation] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareModalUrl, setShareModalUrl] = useState('');
  const [avatarViewerUrl, setAvatarViewerUrl] = useState<string | null>(null);
  const [profileTab, setProfileTab] = useState<PlayerCardProfileTab>('statistics');
  const [profileSportOverride, setProfileSportOverride] = useState<{ userId: string; sport: Sport } | null>(null);
  const showTelegram = !!user;
  const [searchParams] = useSearchParams();
  const sportFromUrl = parseLevelSportQuery(searchParams.get('sport'));
  const viewerPrimarySport = user ? resolveActivePrimarySport(user) ?? undefined : undefined;
  const resolvedProfileSport =
    userId && profileSportOverride?.userId === userId
      ? profileSportOverride.sport
      : undefined;
  const handleCompetitiveSportChange = useCallback((sport: Sport) => {
    if (!userId) return;
    setProfileSportOverride((prev) =>
      prev?.userId === userId && prev.sport === sport ? prev : { userId, sport },
    );
  }, [userId]);

  const {
    stats,
    loading,
    error,
    isBlocked,
    levelSport,
    setStats,
    startingChat,
    blockingUser,
    actions,
  } = usePlayerProfile(userId, {
    levelSport: resolvedProfileSport ?? sportFromUrl ?? viewerPrimarySport,
    presenceKey: 'user-profile-page',
    onBlocked: () => handleBack(navigate),
    onShareFallback: (url) => {
      setShareModalUrl(url);
      setShowShareModal(true);
    },
  });

  useBackButtonHandler();

  useEffect(() => {
    const { setBottomTabsVisible } = useShellNavStore.getState();
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
    setProfileTab('statistics');
    setProfileSportOverride(null);
  }, [userId]);

  const setUserProfileHeaderActions = useShellNavStore((s) => s.setUserProfileHeaderActions);
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
        onToggleFavorite={() => void actions.toggleFavorite()}
        onShare={() => void actions.share()}
        onStartChat={() => void actions.startChat()}
        onBlockPrimary={isBlocked ? () => void actions.unblock() : () => setShowBlockConfirmation(true)}
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
    actions,
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
    <SportLevelProvider sport={levelSport}>
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
                  showProfileTabs
                  showGroupsTab={false}
                  activeProfileTab={profileTab}
                  onProfileTabChange={setProfileTab}
                  onStatsRefresh={setStats}
                  sportHint={sportFromUrl}
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
                  onCompetitiveSportChange={handleCompetitiveSportChange}
                />
              </motion.div>
            )}
          </>
        ) : (
          <motion.div key={error ? 'error' : 'empty'} className="p-8 text-center text-gray-600 dark:text-gray-400">
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
          onConfirm={async () => {
            await actions.block();
            setShowBlockConfirmation(false);
          }}
          onClose={() => setShowBlockConfirmation(false)}
        />
      )}
    </div>
    </SportLevelProvider>
  );
};
