import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowLeft, Share2, Maximize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { UserChat } from '@/api/chat';
import type { CommonChatItem } from '@/api/commonChats';
import { usersApi } from '@/api/users';
import type { MarketItem } from '@/types';
import type { Sport } from '@shared/sport';
import { Loading } from './Loading';
import { ReviewsList } from './ReviewsList';
import { SendMoneyToUserModal } from './SendMoneyToUserModal';
import { ConfirmationModal } from './ConfirmationModal';
import { ShareModal } from './ShareModal';
import { useAuthStore } from '@/store/authStore';
import { useShellNavStore } from '@/store/shellNavStore';
import {
  Drawer,
  DrawerContent,
  DrawerClose,
} from './ui/Drawer';
import { removeOverlay } from '@/utils/urlSchema';
import { appendLevelSportQuery } from '@/utils/levelSportQuery';
import { FullscreenImageViewer } from '@/components/FullscreenImageViewer';
import { PlayerCardProfileBody, type PlayerCardProfileTab } from '@/components/player/PlayerCardProfileBody';
import { PlayerCardCommonGroups } from '@/components/player/PlayerCardCommonGroups';
import { PlayerProfileSocialActions } from '@/components/player/PlayerProfileSocialActions';
import { PlayerProfileActionBar } from '@/components/player/PlayerProfileActionBar';
import { usePlayerProfile } from '@/features/playerProfile';
import { resolveActivePrimarySport } from '@/utils/profileSports';
import { useSportLevelContext } from '@/contexts/useSportLevelContext';

interface PlayerCardBottomSheetProps {
  playerId: string | null;
  onClose: () => void;
}

export const PlayerCardBottomSheet = ({ playerId, onClose }: PlayerCardBottomSheetProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const openSportHint = useSportLevelContext();
  const viewerPrimarySport = user ? resolveActivePrimarySport(user) ?? undefined : undefined;
  const [avatarViewerUrl, setAvatarViewerUrl] = useState<string | null>(null);
  const [showReviewsView, setShowReviewsView] = useState(false);
  const [showSendMoneyModal, setShowSendMoneyModal] = useState(false);
  const [showBlockConfirmation, setShowBlockConfirmation] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareModalUrl, setShareModalUrl] = useState('');
  const [profileTab, setProfileTab] = useState<PlayerCardProfileTab>('statistics');
  const [profileSportOverride, setProfileSportOverride] = useState<{ playerId: string; sport: Sport } | null>(null);
  const [commonChats, setCommonChats] = useState<CommonChatItem[]>([]);
  const [commonChatsLoading, setCommonChatsLoading] = useState(false);
  const navigatingToChatRef = useRef(false);
  const navigatingToFullProfileRef = useRef(false);
  const suppressDrawerDismissUntilRef = useRef(0);
  const resolvedProfileSport =
    playerId && profileSportOverride?.playerId === playerId
      ? profileSportOverride.sport
      : undefined;
  const handleCompetitiveSportChange = useCallback((sport: Sport) => {
    if (!playerId) return;
    setProfileSportOverride((prev) =>
      prev?.playerId === playerId && prev.sport === sport ? prev : { playerId, sport },
    );
  }, [playerId]);

  const markReopenOnBack = useCallback(() => {
    if (!playerId) return;
    const sourceIdx = window.history.state?.idx ?? 0;
    useShellNavStore.getState().setPendingPlayerCardReopen({ playerId, sourceIdx });
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

  const handleShareFallback = useCallback((url: string) => {
    setShareModalUrl(url);
    setShowShareModal(true);
  }, []);

  const handleProfileStartChat = useCallback((chat: UserChat) => {
    markReopenOnBack();
    navigatingToChatRef.current = true;
    navigate(`/user-chat/${chat.id}`, {
      state: { chat, contextType: 'USER' },
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => onClose());
    });
    return true;
  }, [markReopenOnBack, navigate, onClose]);

  const handleOpenFullProfile = useCallback((sport: Sport | undefined) => {
    if (!playerId || playerId === user?.id) return true;
    navigatingToFullProfileRef.current = true;
    navigate(appendLevelSportQuery(`/user-profile/${playerId}`, sport));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => onClose());
    });
    return true;
  }, [navigate, onClose, playerId, user?.id]);

  const playerProfileOptions = useMemo(() => ({
    // Open/game hint → viewer primary; body corrects if subject lacks the sport.
    levelSport: resolvedProfileSport ?? openSportHint ?? viewerPrimarySport,
    presenceKey: 'player-card',
    onBlocked: handleClose,
    onShareFallback: handleShareFallback,
    onStartChat: handleProfileStartChat,
    onOpenFullProfile: handleOpenFullProfile,
  }), [
    resolvedProfileSport,
    openSportHint,
    viewerPrimarySport,
    handleClose,
    handleShareFallback,
    handleProfileStartChat,
    handleOpenFullProfile,
  ]);

  const {
    stats,
    loading,
    isCurrentUser,
    isBlocked,
    setStats,
    startingChat,
    blockingUser,
    actions,
  } = usePlayerProfile(playerId, playerProfileOptions);

  const canFetchCommonChats = !!user && !!playerId && !isCurrentUser && !isBlocked;
  const showGroupsTab = canFetchCommonChats && !commonChatsLoading && commonChats.length > 0;

  useEffect(() => {
    if (!playerId) return;
    setAvatarViewerUrl(null);
    setShowReviewsView(false);
    setShowSendMoneyModal(false);
    setShowShareModal(false);
    setShareModalUrl('');
    setProfileTab('statistics');
    setProfileSportOverride(null);
    setCommonChats([]);
  }, [playerId]);

  useEffect(() => {
    if (!canFetchCommonChats || !playerId) {
      setCommonChats([]);
      return;
    }

    let cancelled = false;
    const fetchCommonChats = async () => {
      try {
        setCommonChatsLoading(true);
        const response = await usersApi.getCommonChats(playerId);
        if (!cancelled) {
          setCommonChats(response.data.filter((chat) => !chat.groupChannel?.isCityGroup));
        }
      } catch (error) {
        console.error('Failed to fetch common chats:', error);
        if (!cancelled) setCommonChats([]);
      } finally {
        if (!cancelled) setCommonChatsLoading(false);
      }
    };

    void fetchCommonChats();
    return () => { cancelled = true; };
  }, [canFetchCommonChats, playerId]);

  useEffect(() => {
    if (!showGroupsTab && profileTab === 'groups') {
      setProfileTab('statistics');
    }
  }, [showGroupsTab, profileTab]);

  const handleAvatarViewerClose = useCallback(() => {
    suppressDrawerDismissUntilRef.current = Date.now() + 400;
    setAvatarViewerUrl(null);
  }, []);

  const handleDrawerOpenChange = useCallback((open: boolean) => {
    if (open) return;
    if (avatarViewerUrl) {
      handleAvatarViewerClose();
      return;
    }
    if (Date.now() < suppressDrawerDismissUntilRef.current) return;
    handleClose();
  }, [avatarViewerUrl, handleAvatarViewerClose, handleClose]);

  const handleOpenCommonChat = useCallback((chat: CommonChatItem) => {
    markReopenOnBack();
    navigatingToChatRef.current = true;

    if (chat.kind === 'game') {
      navigate(`/games/${chat.id}/chat`, { state: { contextType: 'GAME' } });
    } else if (chat.kind === 'bug') {
      navigate(`/bugs/${chat.id}`, {
        state: { groupChannel: chat.groupChannel, contextType: 'GROUP' },
      });
    } else if (chat.kind === 'channel' || chat.kind === 'market') {
      navigate(`/channel-chat/${chat.id}`, {
        state: { groupChannel: chat.groupChannel, contextType: 'GROUP' },
      });
    } else {
      navigate(`/group-chat/${chat.id}`, {
        state: { groupChannel: chat.groupChannel, contextType: 'GROUP' },
      });
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        onClose();
      });
    });
  }, [markReopenOnBack, navigate, onClose]);

  const handleToggleFavorite = useCallback(() => {
    void actions.toggleFavorite();
  }, [actions]);

  const handleShare = useCallback(() => {
    void actions.share();
  }, [actions]);

  const handleStartChat = useCallback(() => {
    void actions.startChat();
  }, [actions]);

  const handleBlockPrimary = useCallback(() => {
    if (isBlocked) {
      void actions.unblock();
      return;
    }
    setShowBlockConfirmation(true);
  }, [actions, isBlocked]);

  const handleAvatarClick = useCallback(() => {
    if (stats?.user.originalAvatar) setAvatarViewerUrl(stats.user.originalAvatar);
  }, [stats?.user.originalAvatar]);

  const handleRatingClick = useCallback(() => {
    setShowReviewsView(true);
  }, []);

  const handleTelegramClick = useCallback(() => {
    if (!stats || isBlocked) return;
    const telegramUrl = stats.user.telegramUsername
      ? `https://t.me/${stats.user.telegramUsername.replace('@', '')}`
      : stats.user.telegramId
        ? `tg://user?id=${stats.user.telegramId}`
        : null;

    if (telegramUrl) window.open(telegramUrl, '_blank');
  }, [isBlocked, stats]);

  const handleOpenGame = useCallback(() => {
    markReopenOnBack();
    handleClose();
  }, [handleClose, markReopenOnBack]);

  const handleMarketItemClick = useCallback((item: MarketItem) => {
    markReopenOnBack();
    handleClose();
    navigate(`/marketplace/${item.id}`);
  }, [handleClose, markReopenOnBack, navigate]);

  const handleReviewClick = useCallback((gameId: string) => {
    markReopenOnBack();
    handleClose();
    navigate(`/games/${gameId}`);
  }, [handleClose, markReopenOnBack, navigate]);

  const groupsContent = useMemo(() => (
    <PlayerCardCommonGroups
      chats={commonChats}
      loading={commonChatsLoading}
      t={t}
      onChatClick={handleOpenCommonChat}
    />
  ), [commonChats, commonChatsLoading, handleOpenCommonChat, t]);

  const prependBeforeLevelHistory = useMemo(() => {
    if (isCurrentUser || !stats) return undefined;

    return (
      <PlayerProfileSocialActions
        isFavorite={!!stats.user.isFavorite}
        isBlocked={isBlocked}
        startingChat={startingChat}
        onToggleFavorite={handleToggleFavorite}
        onStartChat={handleStartChat}
        t={t}
      />
    );
  }, [handleStartChat, handleToggleFavorite, isBlocked, isCurrentUser, startingChat, stats, t]);

  const showRatingLink = !!stats?.user.isTrainer && (stats.user.trainerReviewCount ?? 0) > 0;

  const handleReviewsBack = useCallback(() => {
    setShowReviewsView(false);
  }, []);

  const handleShareModalClose = useCallback(() => {
    setShowShareModal(false);
    setShareModalUrl('');
  }, []);

  const handleSendMoneyClose = useCallback(() => {
    setShowSendMoneyModal(false);
    onClose();
  }, [onClose]);

  const handleBlockConfirmationClose = useCallback(() => {
    setShowBlockConfirmation(false);
  }, []);

  const handleBlockConfirm = useCallback(async () => {
    await actions.block();
    setShowBlockConfirmation(false);
  }, [actions]);

  return (
    <>
      {!showSendMoneyModal && (
      <Drawer open={!!playerId} dismissible={!avatarViewerUrl} onOpenChange={handleDrawerOpenChange}>
          <DrawerContent data-testid="player-card-sheet">
            {showReviewsView && playerId ? (
              <div className="flex shrink-0 items-center justify-between w-full p-2 pl-6">
                <div className="flex items-center gap-4">
                  <button type="button" onClick={handleReviewsBack} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
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
            ) : (
              stats && user ? (
                <PlayerProfileActionBar
                  stats={stats}
                  isCurrentUser={!!isCurrentUser}
                  isBlocked={isBlocked}
                  blockingUser={blockingUser}
                  startingChat={startingChat}
                  onToggleFavorite={handleToggleFavorite}
                  onShare={handleShare}
                  onStartChat={handleStartChat}
                  onBlockPrimary={handleBlockPrimary}
                  onOpenFullProfile={!isCurrentUser ? actions.openFullProfile : undefined}
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
                <div className="flex shrink-0 gap-2 items-center w-full p-2 pl-6">
                  {!isBlocked && (
                    <button
                      type="button"
                      onClick={handleShare}
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
                      onClick={actions.openFullProfile}
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
                <div className="flex shrink-0 gap-2 items-center w-full p-2 pl-6 justify-end">
                  <DrawerClose asChild>
                    <button type="button" className="p-2.5 rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm hover:bg-white dark:hover:bg-gray-800 transition-all duration-200 shadow-sm hover:shadow-md border border-gray-200/50 dark:border-gray-700/50">
                      <X size={20} className="text-gray-600 dark:text-gray-300" />
                    </button>
                  </DrawerClose>
                </div>
              )
            )}

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <div className="pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
                <AnimatePresence mode="wait">
                  {loading ? (
                    <motion.div key="loading" className="flex items-center justify-center h-64" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                      <Loading />
                    </motion.div>
                  ) : showReviewsView && playerId ? (
                    <motion.div
                      key="reviews"
                      className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4"
                      initial={{ opacity: 0, x: 40 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -40 }}
                      transition={{ duration: 0.25, ease: 'easeOut' }}
                    >
                      <ReviewsList
                        trainerId={playerId}
                        initialSummary={stats ? { rating: stats.user.trainerRating ?? null, reviewCount: stats.user.trainerReviewCount ?? 0 } : undefined}
                        onReviewClick={handleReviewClick}
                        showSummary
                        showTitle={false}
                        compact
                      />
                    </motion.div>
                  ) : stats ? (
                    <motion.div key="content" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
                      <PlayerCardProfileBody
                        stats={stats}
                        t={t}
                        isBlocked={isBlocked}
                        showTelegram={!!user}
                        showProfileTabs
                        showGroupsTab={showGroupsTab}
                        activeProfileTab={profileTab}
                        onProfileTabChange={setProfileTab}
                        groupsContent={groupsContent}
                        prependBeforeLevelHistory={prependBeforeLevelHistory}
                        onAvatarClick={handleAvatarClick}
                        onRatingClick={showRatingLink ? handleRatingClick : undefined}
                        onTelegramClick={handleTelegramClick}
                        onOpenGame={handleOpenGame}
                        onMarketItemClick={handleMarketItemClick}
                        onStatsRefresh={setStats}
                        onCompetitiveSportChange={handleCompetitiveSportChange}
                        sportHint={openSportHint}
                        playStreakAliveOnly
                      />
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          </DrawerContent>
      </Drawer>
      )}

      {showSendMoneyModal && playerId && (
        <SendMoneyToUserModal toUserId={playerId} onClose={handleSendMoneyClose} />
      )}

      <ShareModal
        isOpen={showShareModal}
        onClose={handleShareModalClose}
        shareUrl={shareModalUrl}
        dialogTitle={t('playerCard.shareProfileTitle')}
        modalId="share-modal-profile"
      />

      {avatarViewerUrl && (
        <FullscreenImageViewer
          imageUrl={avatarViewerUrl}
          isOpen
          onClose={handleAvatarViewerClose}
          usePortaledOverlay
          modalId="fullscreen-player-avatar-viewer"
        />
      )}

      {showBlockConfirmation && stats && !isBlocked && (
        <ConfirmationModal
          isOpen={showBlockConfirmation}
          title={t('playerCard.blockUser')}
          message={t('playerCard.blockUserConfirmation', { name: stats.user.firstName || '' }) || `Are you sure you want to block ${stats.user.firstName || ''}? You won't be able to see their messages or interact with them.`}
          confirmText={t('playerCard.block')}
          cancelText={t('common.cancel')}
          confirmVariant="danger"
          onConfirm={handleBlockConfirm}
          onClose={handleBlockConfirmationClose}
        />
      )}
    </>
  );
};
