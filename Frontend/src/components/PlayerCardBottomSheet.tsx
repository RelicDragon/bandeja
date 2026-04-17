import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowLeft, Share2, Maximize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { usersApi, UserStats } from '@/api/users';
import { favoritesApi } from '@/api/favorites';
import { blockedUsersApi } from '@/api/blockedUsers';
import { Loading } from './Loading';
import { PlayerAvatarView } from './PlayerAvatarView';
import { ReviewsList } from './ReviewsList';
import { SendMoneyToUserModal } from './SendMoneyToUserModal';
import { ConfirmationModal } from './ConfirmationModal';
import { ShareModal } from './ShareModal';
import { useAuthStore } from '@/store/authStore';
import { useFavoritesStore } from '@/store/favoritesStore';
import { usePlayersStore } from '@/store/playersStore';
import { usePresenceStore } from '@/store/presenceStore';
import { useNavigationStore } from '@/store/navigationStore';
import { usePresenceSubscription } from '@/hooks/usePresenceSubscription';
import {
  Drawer,
  DrawerContent,
  DrawerClose,
} from './ui/Drawer';
import toast from 'react-hot-toast';
import { removeOverlay } from '@/utils/urlSchema';
import { sharePlayerProfile } from '@/utils/sharePlayerProfile';
import { PlayerCardProfileBody } from '@/components/player/PlayerCardProfileBody';
import { PlayerProfileActionBar } from '@/components/player/PlayerProfileActionBar';

interface PlayerCardBottomSheetProps {
  playerId: string | null;
  onClose: () => void;
}

export const PlayerCardBottomSheet = ({ playerId, onClose }: PlayerCardBottomSheetProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const { addFavorite, removeFavorite } = useFavoritesStore();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAvatarView, setShowAvatarView] = useState(false);
  const [showReviewsView, setShowReviewsView] = useState(false);
  const [showSendMoneyModal, setShowSendMoneyModal] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const [showBlockConfirmation, setShowBlockConfirmation] = useState(false);
  const [blockingUser, setBlockingUser] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareModalUrl, setShareModalUrl] = useState('');
  const isCurrentUser = playerId === user?.id;
  const navigatingToChatRef = useRef(false);
  const navigatingToFullProfileRef = useRef(false);

  useEffect(() => {
    if (!playerId) return;
    setShowAvatarView(false);
    setShowReviewsView(false);
    setShowSendMoneyModal(false);
    setShowShareModal(false);
    setShareModalUrl('');

    const fetchStats = async () => {
      try {
        setLoading(true);
        const statsResponse = await usersApi.getUserStats(playerId);
        setStats(statsResponse.data);
        if (user && !isCurrentUser) {
          const blocked = await blockedUsersApi.checkIfUserBlocked(playerId);
          setIsBlocked(blocked);
        } else {
          setIsBlocked(false);
        }
      } catch (error) {
        console.error('Failed to fetch user stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [playerId, isCurrentUser, user]);

  usePresenceSubscription('player-card', user && playerId && !isCurrentUser ? [playerId] : []);

  useEffect(() => {
    if (!user || !playerId || isCurrentUser) return;
    usersApi.getPresence([playerId]).then((data) => {
      if (Object.keys(data).length > 0) usePresenceStore.getState().setPresenceInitial(data);
    }).catch(() => {});
  }, [playerId, isCurrentUser, user]);

  const markReopenOnBack = useCallback(() => {
    if (!playerId) return;
    const sourceIdx = window.history.state?.idx ?? 0;
    useNavigationStore.getState().setPendingPlayerCardReopen({ playerId, sourceIdx });
  }, [playerId]);

  const handleClose = useCallback(() => {
    if (navigatingToFullProfileRef.current) {
      navigatingToFullProfileRef.current = false;
      onClose();
      return;
    }
    if (navigatingToChatRef.current) {
      navigatingToChatRef.current = false;
      onClose();
      return;
    }
    const currentPath = window.location.pathname;
    const currentSearch = window.location.search;
    const isChatPath = currentPath.includes('/user-chat/') || currentPath.includes('/group-chat/') || currentPath.includes('/channel-chat/') || /^\/bugs\/[^/]+$/.test(currentPath) || /^\/user-profile\/[^/]+$/.test(currentPath);
    if (currentSearch.includes('player=') && !isChatPath) {
      const cleanUrl = removeOverlay(currentPath, currentSearch, 'player');
      navigate(cleanUrl, { replace: true });
    }
    onClose();
  }, [onClose, navigate]);

  const handleOpenFullProfile = useCallback(() => {
    if (!playerId || isCurrentUser) return;
    navigatingToFullProfileRef.current = true;
    navigate(`/user-profile/${playerId}`);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        onClose();
      });
    });
  }, [playerId, isCurrentUser, navigate, onClose]);

  const handleToggleFavorite = async () => {
    if (!playerId || !stats || isBlocked) return;
    try {
      if (stats.user.isFavorite) {
        await favoritesApi.removeUserFromFavorites(playerId);
        setStats({ ...stats, user: { ...stats.user, isFavorite: false }, followersCount: Math.max(0, stats.followersCount - 1) });
        removeFavorite(playerId);
        toast.success(t('favorites.userRemovedFromFavorites'));
      } else {
        await favoritesApi.addUserToFavorites(playerId);
        setStats({ ...stats, user: { ...stats.user, isFavorite: true }, followersCount: stats.followersCount + 1 });
        addFavorite(playerId);
        toast.success(t('favorites.userAddedToFavorites'));
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleStartChat = async () => {
    if (!playerId || startingChat || isBlocked) return;
    setStartingChat(true);
    try {
      const chat = await usePlayersStore.getState().getOrCreateAndAddUserChat(playerId);
      if (!chat) {
        toast.error(t('errors.generic', { defaultValue: 'Something went wrong' }));
        return;
      }
      markReopenOnBack();
      navigatingToChatRef.current = true;
      navigate(`/user-chat/${chat.id}`, {
        state: { chat, contextType: 'USER' },
      });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          onClose();
        });
      });
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setStartingChat(false);
    }
  };

  const handleShareProfile = useCallback(async () => {
    if (!playerId || !stats || isBlocked) return;
    const displayName = `${stats.user.firstName || ''} ${stats.user.lastName || ''}`.trim() || t('playerCard.shareProfileFallbackName');
    await sharePlayerProfile({
      playerId,
      displayName,
      t,
      onFallbackModal: (url) => {
        setShareModalUrl(url);
        setShowShareModal(true);
      },
    });
  }, [playerId, stats, isBlocked, t]);

  const handleBlockUser = async () => {
    if (!playerId || blockingUser) return;
    setBlockingUser(true);
    try {
      if (isBlocked) {
        await blockedUsersApi.unblockUser(playerId);
        setIsBlocked(false);
        toast.success(t('playerCard.userUnblocked') || 'User unblocked');
      } else {
        await blockedUsersApi.blockUser(playerId);
        setIsBlocked(true);
        toast.success(t('playerCard.userBlocked') || 'User blocked');
        handleClose();
      }
      try {
        const profileResponse = await usersApi.getProfile();
        updateUser(profileResponse.data);
      } catch (error) {
        console.error('Failed to refresh user profile after block/unblock:', error);
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setBlockingUser(false);
      setShowBlockConfirmation(false);
    }
  };

  return (
    <>
      {!showSendMoneyModal && (
      <Drawer open={!!playerId} onOpenChange={(open) => !open && handleClose()}>
          <DrawerContent>
            {showReviewsView && playerId ? (
              <div className="flex items-center justify-between w-full p-2 pl-6">
                <div className="flex items-center gap-4">
                  <button type="button" onClick={() => setShowReviewsView(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
                  </button>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate">{t('profile.review') || 'Reviews'}</h2>
                </div>
                <DrawerClose asChild>
                  <button type="button" className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                    <X size={20} className="text-gray-600 dark:text-gray-300" />
                  </button>
                </DrawerClose>
              </div>
            ) : showAvatarView && stats ? (
              <div className="flex items-center justify-between w-full p-2 pl-6">
                <div className="flex items-center gap-4">
                  <button type="button" onClick={() => setShowAvatarView(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
                  </button>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate">{`${stats.user.firstName || ''} ${stats.user.lastName || ''}`.trim()}</h2>
                </div>
                <DrawerClose asChild>
                  <button type="button" className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                    <X size={20} className="text-gray-600 dark:text-gray-300" />
                  </button>
                </DrawerClose>
              </div>
            ) : (
              stats && user ? (
                <PlayerProfileActionBar
                  stats={stats}
                  isCurrentUser={!!isCurrentUser}
                  isBlocked={isBlocked}
                  blockingUser={blockingUser}
                  startingChat={startingChat}
                  onToggleFavorite={handleToggleFavorite}
                  onShare={() => void handleShareProfile()}
                  onStartChat={handleStartChat}
                  onBlockPrimary={isBlocked ? handleBlockUser : () => setShowBlockConfirmation(true)}
                  onOpenFullProfile={!isCurrentUser ? handleOpenFullProfile : undefined}
                  t={t}
                  closeSlot={(
                    <DrawerClose asChild>
                      <button type="button" className="p-2.5 rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm hover:bg-white dark:hover:bg-gray-800 transition-all duration-200 shadow-sm hover:shadow-md border border-gray-200/50 dark:border-gray-700/50">
                        <X size={20} className="text-gray-600 dark:text-gray-300" />
                      </button>
                    </DrawerClose>
                  )}
                />
              ) : stats ? (
                <div className="flex gap-2 items-center w-full p-2 pl-6">
                  {!isBlocked && (
                    <button
                      type="button"
                      onClick={() => void handleShareProfile()}
                      className="px-4 py-2 rounded-xl text-white flex items-center justify-center shadow-md bg-gradient-to-r from-slate-500 to-slate-600 hover:from-slate-600 hover:to-slate-700"
                      title={t('playerCard.shareProfileTitle')}
                      aria-label={t('playerCard.shareProfileTitle')}
                    >
                      <Share2 size={18} />
                    </button>
                  )}
                  {!isCurrentUser && (
                    <button
                      type="button"
                      onClick={handleOpenFullProfile}
                      className="px-4 py-2 rounded-xl text-white flex items-center gap-2 shadow-md bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700"
                      title={t('playerCard.openFullProfile')}
                    >
                      <Maximize2 size={18} />
                      <span className="text-sm">{t('playerCard.openFullProfile')}</span>
                    </button>
                  )}
                  <DrawerClose asChild>
                    <button type="button" className="p-2.5 ml-auto rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm hover:bg-white dark:hover:bg-gray-800 transition-all duration-200 shadow-sm hover:shadow-md border border-gray-200/50 dark:border-gray-700/50">
                      <X size={20} className="text-gray-600 dark:text-gray-300" />
                    </button>
                  </DrawerClose>
                </div>
              ) : (
                <div className="flex gap-2 items-center w-full p-2 pl-6 justify-end">
                  <DrawerClose asChild>
                    <button type="button" className="p-2.5 rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm hover:bg-white dark:hover:bg-gray-800 transition-all duration-200 shadow-sm hover:shadow-md border border-gray-200/50 dark:border-gray-700/50">
                      <X size={20} className="text-gray-600 dark:text-gray-300" />
                    </button>
                  </DrawerClose>
                </div>
              )
            )}

            <div className="flex flex-col min-h-0 flex-1 max-h-[calc(75vh-4rem)] overflow-y-auto" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))' }}>
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.div key="loading" className="flex items-center justify-center h-64" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                    <Loading />
                  </motion.div>
                ) : showReviewsView && playerId ? (
                  <motion.div
                    key="reviews"
                    className="flex-1 min-h-0 flex flex-col px-4 pb-4 overflow-y-auto"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                  >
                    <ReviewsList
                      trainerId={playerId}
                      initialSummary={stats ? { rating: stats.user.trainerRating ?? null, reviewCount: stats.user.trainerReviewCount ?? 0 } : undefined}
                      onReviewClick={(gameId) => { markReopenOnBack(); handleClose(); navigate(`/games/${gameId}`); }}
                      showSummary
                      showTitle={false}
                      compact
                    />
                  </motion.div>
                ) : stats ? (
                  <>
                    {showAvatarView && stats.user.originalAvatar ? (
                      <motion.div key="avatar" className="flex-1 min-h-0 flex flex-col" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3, ease: 'easeInOut' }}>
                        <PlayerAvatarView stats={stats} />
                      </motion.div>
                    ) : (
                      <motion.div key="content" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
                        <PlayerCardProfileBody
                          stats={stats}
                          t={t}
                          isBlocked={isBlocked}
                          showTelegram={!!user}
                          onAvatarClick={() => { if (stats.user.originalAvatar) setShowAvatarView(true); }}
                          onRatingClick={stats.user.isTrainer && (stats.user.trainerReviewCount ?? 0) > 0 ? () => setShowReviewsView(true) : undefined}
                          onTelegramClick={() => {
                            const getTelegramUrl = () => {
                              if (stats.user.telegramUsername) return `https://t.me/${stats.user.telegramUsername.replace('@', '')}`;
                              if (stats.user.telegramId) return `tg://user?id=${stats.user.telegramId}`;
                              return null;
                            };
                            const telegramUrl = getTelegramUrl();
                            if (telegramUrl && !isBlocked) window.open(telegramUrl, '_blank');
                          }}
                          onOpenGame={() => { markReopenOnBack(); handleClose(); }}
                          onMarketItemClick={(item) => { markReopenOnBack(); handleClose(); navigate(`/marketplace/${item.id}`); }}
                        />
                      </motion.div>
                    )}
                  </>
                ) : null}
              </AnimatePresence>
            </div>
          </DrawerContent>
      </Drawer>
      )}

      {showSendMoneyModal && playerId && (
        <SendMoneyToUserModal toUserId={playerId} onClose={() => { setShowSendMoneyModal(false); onClose(); }} />
      )}

      <ShareModal
        isOpen={showShareModal}
        onClose={() => { setShowShareModal(false); setShareModalUrl(''); }}
        shareUrl={shareModalUrl}
        dialogTitle={t('playerCard.shareProfileTitle')}
        modalId="share-modal-profile"
      />

      {showBlockConfirmation && stats && !isBlocked && (
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
    </>
  );
};
