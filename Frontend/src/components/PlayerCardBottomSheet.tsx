import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { X, Beer, Star, ArrowLeft, Send, MessageCircle, Ban, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { usersApi, UserStats } from '@/api/users';
import { favoritesApi } from '@/api/favorites';
import { chatApi } from '@/api/chat';
import { blockedUsersApi } from '@/api/blockedUsers';
import { Loading } from './Loading';
import { PlayerAvatarView } from './PlayerAvatarView';
import { LevelHistoryView } from './LevelHistoryView';
import { GenderIndicator } from './GenderIndicator';
import { SendMoneyToUserModal } from './SendMoneyToUserModal';
import { GamesStatsSection } from './GamesStatsSection';
import { ConfirmationModal } from './ConfirmationModal';
import { Button } from './Button';
import { useAuthStore } from '@/store/authStore';
import { useFavoritesStore } from '@/store/favoritesStore';
import toast from 'react-hot-toast';

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
  const [isClosing, setIsClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [showAvatarView, setShowAvatarView] = useState(false);
  const [showLevelView, setShowLevelView] = useState(false);
  const [showSendMoneyModal, setShowSendMoneyModal] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const [gamesStatsTab, setGamesStatsTab] = useState<'30' | '90' | 'all'>('30');
  const [isClosingViaBack, setIsClosingViaBack] = useState(false);
  const [showBlockConfirmation, setShowBlockConfirmation] = useState(false);
  const [blockingUser, setBlockingUser] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const isCurrentUser = playerId === user?.id;

  // Disable background scrolling and interactions when modal is open
  useEffect(() => {
    if (playerId) {
      // Prevent background scrolling
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      
      // Prevent touch events on background
      document.body.style.touchAction = 'none';
    } else {
      // Restore scrolling when modal is closed
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.touchAction = '';
    }

    // Cleanup function to restore scrolling
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.touchAction = '';
    };
  }, [playerId]);

  useEffect(() => {
    if (!playerId) return;

    // Reset drag position when modal opens
    setDragY(0);
    setIsClosing(false);
    setShowAvatarView(false);
    setShowLevelView(false);
    setShowSendMoneyModal(false);

    const fetchStats = async () => {
      try {
        setLoading(true);
        const statsResponse = await usersApi.getUserStats(playerId);
        setStats(statsResponse.data);
        
        if (!isCurrentUser) {
          const blocked = await blockedUsersApi.checkIfUserBlocked(playerId);
          setIsBlocked(blocked);
        }
      } catch (error) {
        console.error('Failed to fetch user stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [playerId, isCurrentUser]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 300);
  }, [onClose]);

  useEffect(() => {
    if (!playerId) {
      setIsClosingViaBack(false);
      return;
    }

    // Push state to history when modal opens
    const hasHistoryState = window.history.state?.playerCardOpen;
    if (!hasHistoryState) {
      window.history.pushState({ playerCardOpen: true }, '');
    }

    // Handle browser back button
    const handlePopState = () => {
      if (playerId) {
        setIsClosingViaBack(true);
        handleClose();
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      // Remove the history state if modal closes normally (not via back button)
      if (window.history.state?.playerCardOpen && playerId && !isClosingViaBack) {
        try {
          window.history.back();
        } catch (error) {
          // Ignore errors if history is not available
        }
      }
    };
  }, [playerId, handleClose, isClosingViaBack]);

  const handleDrag = (_event: any, info: PanInfo) => {
    setDragY(info.offset.y);
  };

  const handleDragEnd = (_event: any, info: PanInfo) => {
    const threshold = 100;
    const velocity = info.velocity.y;
    
    // Allow closing if dragged down more than threshold or with high velocity
    if (info.offset.y > threshold || velocity > 200) {
      handleClose();
    } else {
      // Spring back to original position with animation
      setDragY(0);
    }
  };

  const handleToggleFavorite = async () => {
    if (!playerId || !stats || isBlocked) return;

    try {
      if (stats.user.isFavorite) {
        await favoritesApi.removeUserFromFavorites(playerId);
        setStats({ 
          ...stats, 
          user: { ...stats.user, isFavorite: false },
          followersCount: Math.max(0, stats.followersCount - 1)
        });
        removeFavorite(playerId);
        toast.success(t('favorites.userRemovedFromFavorites'));
      } else {
        await favoritesApi.addUserToFavorites(playerId);
        setStats({ 
          ...stats, 
          user: { ...stats.user, isFavorite: true },
          followersCount: stats.followersCount + 1
        });
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
      const response = await chatApi.getOrCreateChatWithUser(playerId);
      const chat = response.data;
      
      if (chat) {
        onClose();
        navigate(`/user-chat/${chat.id}`, { state: { chat, contextType: 'USER' } });
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setStartingChat(false);
    }
  };

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

  if (!playerId) return null;

  // Calculate dynamic blur based on drag position
  const maxBlur = 8;
  const maxDrag = window.innerHeight * 0.3; // Maximum drag distance for full deblur
  const blurValue = Math.max(0, maxBlur - (dragY / maxDrag) * maxBlur);

  return (
    <AnimatePresence>
      {!showSendMoneyModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[99999]"
          onClick={handleClose}
          style={{ 
            pointerEvents: 'auto',
            touchAction: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none'
          }}
        >
        <motion.div
          initial={{ backdropFilter: 'blur(0px)' }}
          animate={{ backdropFilter: isClosing ? 'blur(0px)' : `blur(${blurValue}px)` }}
          exit={{ backdropFilter: 'blur(0px)' }}
          transition={isClosing ? { duration: 0.3 } : dragY === 0 ? { 
            type: 'spring', 
            damping: 25, 
            stiffness: 400, 
            duration: 0.3 
          } : { duration: 0 }}
          className="absolute inset-0 bg-black/50"
          style={{
            pointerEvents: 'auto',
            touchAction: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none'
          }}
        />
        
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: isClosing ? '100%' : dragY }}
          exit={{ y: '100%' }}
          transition={dragY === 0 ? {
            type: 'spring',
            damping: 25,
            stiffness: 400,
            duration: 0.3
          } : {
            type: 'spring',
            damping: 30,
            stiffness: 300,
            duration: 0.4
          }}
          drag="y"
          dragConstraints={{ top: 0, bottom: window.innerHeight * 0.9 }}
          dragElastic={{ top: 0, bottom: 0.2 }}
          dragMomentum={false}
          dragTransition={{ bounceStiffness: 300, bounceDamping: 20 }}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
          className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-3xl shadow-2xl max-h-[75vh] overflow-hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="h-8 w-full cursor-grab active:cursor-grabbing" />
          
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
            {showLevelView ? (
              <>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setShowLevelView(false)}
                    className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
                  </button>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {t('playerCard.levelHistory')}
                  </h2>
                </div>
                <button
                  onClick={handleClose}
                  className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <X size={20} className="text-gray-600 dark:text-gray-300" />
                </button>
              </>
            ) : (
              <div className="flex gap-2 items-center ml-auto">
            {stats && !isCurrentUser && (
              <button
                onClick={isBlocked ? handleBlockUser : () => setShowBlockConfirmation(true)}
                disabled={blockingUser}
                className={`px-4 py-2 rounded-xl text-white transition-all duration-200 flex items-center gap-2 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${
                  isBlocked 
                    ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700' 
                    : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700'
                }`}
                title={isBlocked ? t('playerCard.unblockUser') : t('playerCard.blockUser')}
              >
                {isBlocked ? <Check size={18} /> : <Ban size={18} className="scale-x-[-1]" />}
              </button>
            )}
            {stats && !isCurrentUser && (
              <Button
                onClick={handleStartChat}
                disabled={startingChat || isBlocked}
                variant="primary"
                size="sm"
                className="flex items-center gap-2"
                title={isBlocked ? t('playerCard.userBlockedCannotChat') : t('nav.chat')}
              >
                <MessageCircle size={16} />
                {t('nav.chat')}
              </Button>
            )}
            {stats && !isCurrentUser && (
              <button
                onClick={handleToggleFavorite}
                disabled={isBlocked}
                className={`p-2.5 rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm transition-all duration-200 shadow-sm border border-gray-200/50 dark:border-gray-700/50 ${
                  isBlocked
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-white dark:hover:bg-gray-800 hover:shadow-md hover:scale-105 active:scale-95'
                }`}
                title={isBlocked ? t('playerCard.userBlockedCannotFavorite') : (stats.user.isFavorite ? t('favorites.removeFromFavorites') : t('favorites.addToFavorites'))}
              >
                <Star
                  size={20}
                  className={stats.user.isFavorite
                    ? 'text-yellow-500 fill-yellow-500'
                    : 'text-gray-400 hover:text-yellow-500 transition-colors'
                  }
                />
              </button>
            )}
            <button
              onClick={handleClose}
              className="p-2.5 rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm hover:bg-white dark:hover:bg-gray-800 transition-all duration-200 shadow-sm hover:shadow-md hover:scale-105 active:scale-95 border border-gray-200/50 dark:border-gray-700/50"
            >
              <X size={20} className="text-gray-600 dark:text-gray-300" />
            </button>
              </div>
            )}
          </div>

          <div className="overflow-y-auto max-h-[calc(75vh-20px)] pt-4">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <Loading />
              </div>
            ) : stats ? (
              <AnimatePresence mode="wait">
                {showAvatarView && stats.user.originalAvatar ? (
                  <motion.div
                    key="avatar-view"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  >
                    <PlayerAvatarView stats={stats} onBack={() => setShowAvatarView(false)} />
                  </motion.div>
                ) : showLevelView ? (
                  <motion.div
                    key="level-view"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  >
                    <LevelHistoryView stats={stats} padding="p-6" tabDarkBgClass="dark:bg-gray-700/50" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="player-card"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  >
                    <PlayerCardContent 
                      stats={stats} 
                      t={t} 
                      isBlocked={isBlocked}
                      onAvatarClick={() => {
                        if (stats.user.originalAvatar) {
                          setShowAvatarView(true);
                        }
                      }}
                      onLevelClick={() => setShowLevelView(true)}
                      gamesStatsTab={gamesStatsTab}
                      onGamesStatsTabChange={setGamesStatsTab}
                      onTelegramClick={() => {
                        const getTelegramUrl = () => {
                          if (stats.user.telegramUsername) {
                            return `https://t.me/${stats.user.telegramUsername.replace('@', '')}`;
                          }
                          if (stats.user.telegramId) {
                            return `tg://user?id=${stats.user.telegramId}`;
                          }
                          return null;
                        };
                        const telegramUrl = getTelegramUrl();
                        if (telegramUrl && !isBlocked) {
                          window.open(telegramUrl, '_blank');
                        }
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            ) : null}
          </div>
        </motion.div>
      </motion.div>
      )}

      {showSendMoneyModal && playerId && (
        <SendMoneyToUserModal
          toUserId={playerId}
          onClose={() => {
            setShowSendMoneyModal(false);
            onClose();
          }}
        />
      )}

      {showBlockConfirmation && stats && !isBlocked && (
        <ConfirmationModal
          isOpen={showBlockConfirmation}
          title={t('playerCard.blockUser')}
          message={t('playerCard.blockUserConfirmation', { name: stats.user.firstName }) || `Are you sure you want to block ${stats.user.firstName}? You won't be able to see their messages or interact with them.`}
          confirmText={t('playerCard.block')}
          cancelText={t('common.cancel')}
          confirmVariant="danger"
          onConfirm={handleBlockUser}
          onClose={() => setShowBlockConfirmation(false)}
        />
      )}
    </AnimatePresence>
  );
};

interface PlayerCardContentProps {
  stats: UserStats;
  t: (key: string) => string;
  isBlocked: boolean;
  onAvatarClick: () => void;
  onLevelClick: () => void;
  gamesStatsTab: '30' | '90' | 'all';
  onGamesStatsTabChange: (tab: '30' | '90' | 'all') => void;
  onTelegramClick: () => void;
}

const PlayerCardContent = ({ stats, t, isBlocked, onAvatarClick, onLevelClick, gamesStatsTab, onGamesStatsTabChange, onTelegramClick }: PlayerCardContentProps) => {
  const { user } = stats;
  const isFavorite = useFavoritesStore((state) => state.isFavorite(user.id));
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  const hasTelegram = !!(user.telegramId || user.telegramUsername);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.3 }}
      className="p-6 space-y-6"
    >
      <div className={`relative h-48 rounded-2xl ${
        isBlocked 
          ? 'bg-gradient-to-br from-red-500 to-red-700 dark:from-red-600 dark:to-red-800' 
          : 'bg-gradient-to-br from-primary-500 to-primary-700 dark:from-primary-600 dark:to-primary-800'
      }`}>
        <div className="absolute inset-0 flex items-center justify-center gap-6">
          <div className="relative">
            {user.originalAvatar ? (
              <button
                onClick={onAvatarClick}
                className="cursor-pointer hover:opacity-90 transition-opacity"
              >
                {user.avatar ? (
                  <img
                    src={user.avatar || ''}
                    alt={`${user.firstName} ${user.lastName}`}
                    className={`w-32 h-32 rounded-full object-cover border-4 border-white dark:border-gray-800 shadow-xl ${isFavorite ? 'ring-[3px] ring-yellow-600 dark:ring-yellow-400' : ''}`}
                  />
                ) : (
                  <div className={`w-32 h-32 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-5xl border-4 border-white dark:border-gray-800 shadow-xl ${isFavorite ? 'ring-[3px] ring-yellow-600 dark:ring-yellow-400' : ''}`}>
                    {initials}
                  </div>
                )}
              </button>
            ) : user.avatar ? (
              <img
                src={user.avatar || ''}
                alt={`${user.firstName} ${user.lastName}`}
                className={`w-32 h-32 rounded-full object-cover border-4 border-white dark:border-gray-800 shadow-xl ${isFavorite ? 'ring-[3px] ring-yellow-600 dark:ring-yellow-400' : ''}`}
              />
            ) : (
              <div className={`w-32 h-32 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-5xl border-4 border-white dark:border-gray-800 shadow-xl ${isFavorite ? 'ring-[3px] ring-yellow-600 dark:ring-yellow-400' : ''}`}>
                {initials}
              </div>
            )}
            <div className="absolute -bottom-1 -left-4">
              <GenderIndicator gender={user.gender} layout="big" position="bottom-left" />
            </div>
          </div>
          <div className="text-left text-white">
            <h2 className="text-2xl font-bold">
              {user.firstName}
              {isBlocked && (
                <span className="ml-2 text-lg font-semibold opacity-90">
                  ({t('playerCard.blocked') || 'Blocked'})
                </span>
              )}
            </h2>
            {user.lastName && (
              <h3 className="text-xl font-semibold">
                {user.lastName}
              </h3>
            )}
            <button
              onClick={onLevelClick}
              className="mt-2 bg-yellow-500 dark:bg-yellow-600 text-white px-3 py-1.5 rounded-full font-bold text-sm shadow-lg flex items-center gap-1 hover:bg-yellow-600 dark:hover:bg-yellow-700 transition-colors cursor-pointer"
            >
              <span>{user.level.toFixed(2)}</span>
              <span>•</span>
              <div className="relative flex items-center">
                <Beer
                  size={14}
                  className="text-amber-600 dark:text-amber-500 absolute"
                  fill="currentColor"
                />
                <Beer
                  size={14}
                  className="text-white dark:text-gray-900 relative z-10"
                  strokeWidth={1.5}
                />
              </div>
              <span>{user.socialLevel?.toFixed(2) || '1.00'}</span>
            </button>
          </div>
        </div>
        {user.isTrainer && (
          <div className="absolute top-3 left-3 bg-green-500 dark:bg-green-600 text-white px-3 py-1 rounded-full font-semibold text-sm shadow-lg">
            {t('playerCard.isTrainer')}
          </div>
        )}
        {hasTelegram && (
          <button
            onClick={onTelegramClick}
            disabled={isBlocked}
            className="absolute bottom-2 right-2 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-xl hover:scale-105 active:scale-95"
            style={{
              backgroundColor: isBlocked ? '#9CA3AF' : '#229ED9',
            }}
            onMouseEnter={(e) => {
              if (!isBlocked) {
                e.currentTarget.style.backgroundColor = '#1E8BC3';
              }
            }}
            onMouseLeave={(e) => {
              if (!isBlocked) {
                e.currentTarget.style.backgroundColor = '#229ED9';
              }
            }}
            title={isBlocked ? t('playerCard.userBlockedCannotChat') : t('playerCard.openTelegramChat')}
          >
            <Send size={12} className="text-white flex-shrink-0" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={onLevelClick}
          className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 text-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
        >
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.followersCount}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">{t('playerCard.followers') || 'Followers'}</div>
        </button>
        <button
          onClick={onLevelClick}
          className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 text-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
        >
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.followingCount}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">{t('playerCard.following') || 'Following'}</div>
        </button>
      </div>

      <GamesStatsSection
        stats={stats.gamesStats}
        activeTab={gamesStatsTab}
        onTabChange={onGamesStatsTabChange}
        onLevelClick={onLevelClick}
        darkBgClass="dark:bg-gray-700/50"
      />

      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
              {t('profile.preferredHand')}
            </div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {user.preferredHandLeft && user.preferredHandRight 
                ? `${t('profile.left')}/${t('profile.right')}`
                : user.preferredHandLeft 
                ? t('profile.left')
                : user.preferredHandRight 
                ? t('profile.right')
                : '-'
              }
            </div>
          </div>
          <div className="text-center">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
              {t('profile.preferredCourtSide')}
            </div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {user.preferredCourtSideLeft && user.preferredCourtSideRight 
                ? `${t('profile.left')}/${t('profile.right')}`
                : user.preferredCourtSideLeft 
                ? t('profile.left')
                : user.preferredCourtSideRight 
                ? t('profile.right')
                : '-'
              }
            </div>
          </div>
        </div>
      </div>

    </motion.div>
  );
};
