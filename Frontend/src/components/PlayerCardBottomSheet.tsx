import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, useMotionValueEvent } from 'framer-motion';
import { X, Beer, Star, ArrowLeft, Send, MessageCircle, Ban, Check, LineChart, Dumbbell } from 'lucide-react';
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
import { BaseModal } from './BaseModal';
import toast from 'react-hot-toast';
import { canNavigateBack } from '@/utils/navigation';

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
  const sheetRef = useRef<HTMLDivElement>(null);
  const y = useMotionValue(0);
  const springConfig = { damping: 30, stiffness: 300 };
  const ySpring = useSpring(y, springConfig);
  
  // Calculate dynamic blur and opacity based on drag position
  const maxBlur = 8;
  const maxDrag = typeof window !== 'undefined' ? window.innerHeight * 0.3 : 300;
  const blurValue = useTransform(ySpring, [0, maxDrag], [maxBlur, 0], { clamp: true });
  const backdropOpacity = useTransform(ySpring, [0, maxDrag], [1, 0.3], { clamp: true });
  const [backdropBlur, setBackdropBlur] = useState(maxBlur);

  useMotionValueEvent(blurValue, 'change', (latest) => {
    setBackdropBlur(latest);
  });

  useEffect(() => {
    if (!playerId) return;

    // Reset drag position when modal opens
    setDragY(0);
    setIsClosing(false);
    setShowAvatarView(false);
    setShowLevelView(false);
    setShowSendMoneyModal(false);
    y.set(0);

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
  }, [playerId, isCurrentUser, y]);

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
          if (canNavigateBack()) {
            navigate(-1);
          }
        } catch (error) {
          // Ignore errors if history is not available
        }
      }
    };
  }, [playerId, handleClose, isClosingViaBack]);


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

  return (
    <>
      {!showSendMoneyModal && (
        <BaseModal
          isOpen={!!playerId}
          onClose={handleClose}
          isBasic={false}
          modalId="player-card-bottom-sheet"
          showCloseButton={false}
          closeOnBackdropClick={true}
        >
          <AnimatePresence>
            {playerId && (
              <motion.div
                className="fixed inset-0"
                onClick={handleClose}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  className="absolute inset-0 bg-black/50"
                  style={{
                    opacity: backdropOpacity,
                    backdropFilter: `blur(${backdropBlur}px)`,
                    WebkitBackdropFilter: `blur(${backdropBlur}px)`,
                    transition: dragY === 0 ? 'backdrop-filter 0.1s' : 'none',
                  }}
                />
                
                <motion.div
                  ref={sheetRef}
                  className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-3xl shadow-2xl max-h-[75vh] overflow-hidden max-w-[428px] mx-auto"
                  style={{
                    y: ySpring,
                    paddingBottom: 'env(safe-area-inset-bottom)',
                  }}
                  initial={{ y: '100%' }}
                  animate={{ y: isClosing ? '100%' : 0 }}
                  exit={{ y: '100%' }}
                  transition={{
                    type: 'spring',
                    damping: 30,
                    stiffness: 300,
                  }}
                  drag="y"
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0, bottom: 0.3 }}
                  onDrag={(_, info) => {
                    const dragAmount = info.offset.y;
                    setDragY(dragAmount);
                  }}
                  onDragEnd={(_, info) => {
                    const threshold = 100;
                    const velocity = info.velocity.y;
                    if (info.offset.y > threshold || velocity > 500) {
                      handleClose();
                    } else {
                      y.set(0);
                      setDragY(0);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
              <div className="h-8 w-full cursor-grab active:cursor-grabbing touch-none" />
          
          <motion.div
            className="absolute top-4 left-4 right-4 flex items-center justify-between z-10"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <AnimatePresence mode="wait">
              {showLevelView ? (
                <motion.div
                  key="level-header"
                  className="flex items-center justify-between w-full"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-center gap-4">
                    <motion.button
                      onClick={() => setShowLevelView(false)}
                      className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
                    </motion.button>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                      {t('playerCard.levelHistory')}
                    </h2>
                  </div>
                  <motion.button
                    onClick={handleClose}
                    className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <X size={20} className="text-gray-600 dark:text-gray-300" />
                  </motion.button>
                </motion.div>
              ) : (
                <motion.div
                  key="main-header"
                  className="flex gap-2 items-center ml-auto"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
            {stats && !isCurrentUser && (
              <motion.button
                onClick={isBlocked ? handleBlockUser : () => setShowBlockConfirmation(true)}
                disabled={blockingUser}
                className={`px-4 py-2 rounded-xl text-white flex items-center gap-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
                  isBlocked 
                    ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700' 
                    : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700'
                }`}
                title={isBlocked ? t('playerCard.unblockUser') : t('playerCard.blockUser')}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              >
                {isBlocked ? <Check size={18} /> : <Ban size={18} className="scale-x-[-1]" />}
              </motion.button>
            )}
            {stats && (
              <motion.button
                onClick={() => {
                  setShowAvatarView(false);
                  setShowLevelView(true);
                }}
                className="px-4 py-2 rounded-xl text-white flex items-center gap-2 shadow-md bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
                title={t('playerCard.levelHistory')}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              >
                <LineChart size={18} />
              </motion.button>
            )}
            {stats && !isCurrentUser && (
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              >
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
              </motion.div>
            )}
            {stats && !isCurrentUser && (
              <motion.button
                onClick={handleToggleFavorite}
                disabled={isBlocked}
                className={`p-2.5 rounded-xl backdrop-blur-sm shadow-sm border ${
                  isBlocked
                    ? 'opacity-50 cursor-not-allowed bg-white/80 dark:bg-gray-800/80 border-gray-200/50 dark:border-gray-700/50'
                    : stats.user.isFavorite
                    ? 'bg-yellow-500 dark:bg-yellow-600 border-yellow-400 dark:border-yellow-500 hover:bg-yellow-600 dark:hover:bg-yellow-700'
                    : 'bg-white/80 dark:bg-gray-800/80 border-gray-200/50 dark:border-gray-700/50 hover:bg-white dark:hover:bg-gray-800'
                }`}
                title={isBlocked ? t('playerCard.userBlockedCannotFavorite') : (stats.user.isFavorite ? t('favorites.removeFromFavorites') : t('favorites.addToFavorites'))}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              >
                <Star
                  size={20}
                  className={stats.user.isFavorite
                    ? 'text-white fill-white'
                    : 'text-gray-400 hover:text-yellow-500 transition-colors'
                  }
                />
              </motion.button>
            )}
            <motion.button
              onClick={handleClose}
              className="p-2.5 rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm hover:bg-white dark:hover:bg-gray-800 transition-all duration-200 shadow-sm hover:shadow-md border border-gray-200/50 dark:border-gray-700/50"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <X size={20} className="text-gray-600 dark:text-gray-300" />
            </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

              <div className="overflow-y-auto max-h-[calc(75vh-20px)] pt-4">
                <AnimatePresence mode="wait">
                  {loading ? (
                    <motion.div
                      key="loading"
                      className="flex items-center justify-center h-64"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Loading />
                    </motion.div>
                  ) : stats ? (
                    <>
                      {showAvatarView && stats.user.originalAvatar ? (
                        <motion.div
                          key="avatar"
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          transition={{ duration: 0.3, ease: 'easeInOut' }}
                        >
                          <PlayerAvatarView stats={stats} onBack={() => setShowAvatarView(false)} />
                        </motion.div>
                      ) : showLevelView ? (
                        <motion.div
                          key="level"
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          transition={{ duration: 0.3, ease: 'easeInOut' }}
                        >
                          <LevelHistoryView stats={stats} padding="p-6" tabDarkBgClass="dark:bg-gray-700/50" />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="content"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 20 }}
                          transition={{ duration: 0.3, ease: 'easeOut' }}
                        >
                          <PlayerCardContent 
                            stats={stats} 
                            t={t} 
                            isBlocked={isBlocked}
                            onAvatarClick={() => {
                              if (stats.user.originalAvatar) {
                                setShowLevelView(false);
                                setShowAvatarView(true);
                              }
                            }}
                            onLevelClick={() => {
                              setShowAvatarView(false);
                              setShowLevelView(true);
                            }}
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
                    </>
                  ) : null}
                </AnimatePresence>
              </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </BaseModal>
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

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.3,
        ease: [0.4, 0, 0.2, 1] as const,
      },
    },
  };

  return (
    <motion.div
      className="p-6 space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div
        className={`relative h-48 rounded-2xl ${
          isBlocked 
            ? 'bg-gradient-to-br from-red-500 to-red-700 dark:from-red-600 dark:to-red-800' 
            : 'bg-gradient-to-br from-primary-500 to-primary-700 dark:from-primary-600 dark:to-primary-800'
        }`}
        variants={itemVariants}
      >
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
                    alt={`${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User'}
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
          </div>
          <div className="text-left text-white">
            {(user.isTrainer || user.gender) && (
              <div className="mb-2 flex items-center gap-2">
                {user.isTrainer && (
                  <div 
                    className="bg-blue-500 dark:bg-blue-600 text-white px-3 py-1 rounded-full font-semibold text-sm flex items-center gap-1.5 border-2 border-white dark:border-gray-900 w-fit"
                    style={{
                      boxShadow: '0 6px 15px rgba(0, 0, 0, 0.4), 0 2px 6px rgba(0, 0, 0, 0.2)'
                    }}
                  >
                    <Dumbbell size={14} className="text-white" />
                    <span>{t('playerCard.isTrainer')}</span>
                  </div>
                )}
                <GenderIndicator gender={user.gender} layout="big" position="bottom-left" />
              </div>
            )}
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
            <div className="mt-2 flex items-center gap-0">
              <button
                onClick={onLevelClick}
                className="bg-yellow-500 dark:bg-yellow-600 text-white px-3 py-1.5 rounded-full font-bold text-sm shadow-lg flex items-center gap-1 hover:bg-yellow-600 dark:hover:bg-yellow-700 transition-colors cursor-pointer"
              >

              {user.approvedLevel && (
                <Check size={14} className="text-white" strokeWidth={3} />
              )}
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
                <span>{user.socialLevel.toFixed(2)}</span>
              </button>
            </div>
          </div>
        </div>
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
      </motion.div>

      <motion.div
        className="grid grid-cols-2 gap-4"
        variants={itemVariants}
      >
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
      </motion.div>

      <motion.div variants={itemVariants}>
        <GamesStatsSection
        stats={stats.gamesStats}
        activeTab={gamesStatsTab}
        onTabChange={onGamesStatsTabChange}
        onLevelClick={onLevelClick}
        darkBgClass="dark:bg-gray-700/50"
      />
      </motion.div>

      <motion.div
        className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4"
        variants={itemVariants}
      >
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
      </motion.div>
    </motion.div>
  );
};
