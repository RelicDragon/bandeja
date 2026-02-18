import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Star, ArrowLeft, Send, MessageCircle, Ban, Check, Dumbbell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { usersApi, UserStats } from '@/api/users';
import { favoritesApi } from '@/api/favorites';
import { chatApi } from '@/api/chat';
import { blockedUsersApi } from '@/api/blockedUsers';
import { Loading } from './Loading';
import { PlayerAvatarView } from './PlayerAvatarView';
import { LevelHistoryView } from './LevelHistoryView';
import { GenderIndicator } from './GenderIndicator';
import { MarketItem } from '@/types';
import { SendMoneyToUserModal } from './SendMoneyToUserModal';
import { ConfirmationModal } from './ConfirmationModal';
import { useAuthStore } from '@/store/authStore';
import { useFavoritesStore } from '@/store/favoritesStore';
import { usePresenceStore } from '@/store/presenceStore';
import { usePresenceSubscription } from '@/hooks/usePresenceSubscription';
import {
  Drawer,
  DrawerContent,
  DrawerClose,
} from './ui/Drawer';
import toast from 'react-hot-toast';
import { removeOverlay } from '@/utils/urlSchema';

interface PlayerCardBottomSheetProps {
  playerId: string | null;
  onClose: () => void;
}

export const PlayerCardBottomSheet = ({ playerId, onClose }: PlayerCardBottomSheetProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const { addFavorite, removeFavorite } = useFavoritesStore();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAvatarView, setShowAvatarView] = useState(false);
  const [showSendMoneyModal, setShowSendMoneyModal] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const [showBlockConfirmation, setShowBlockConfirmation] = useState(false);
  const [blockingUser, setBlockingUser] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const isCurrentUser = playerId === user?.id;

  useEffect(() => {
    if (!playerId) return;
    setShowAvatarView(false);
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

  usePresenceSubscription('player-card', playerId && !isCurrentUser ? [playerId] : []);

  useEffect(() => {
    if (!playerId || isCurrentUser) return;
    usersApi.getPresence([playerId]).then((data) => {
      if (Object.keys(data).length > 0) usePresenceStore.getState().setPresenceInitial(data);
    }).catch(() => {});
  }, [playerId, isCurrentUser]);

  const handleClose = useCallback(() => {
    const currentParams = new URLSearchParams(location.search);
    if (currentParams.has('player')) {
      const cleanUrl = removeOverlay(location.pathname, location.search, 'player');
      navigate(cleanUrl, { replace: true });
    }
    onClose();
  }, [onClose, location.pathname, location.search, navigate]);

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
      <Drawer open={!!playerId} onOpenChange={(open) => !open && handleClose()}>
          <DrawerContent>
            {showAvatarView && stats ? (
              <div className="flex items-center justify-between w-full p-2 pl-6">
                <div className="flex items-center gap-4">
                  <button onClick={() => setShowAvatarView(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
                  </button>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate">{`${stats.user.firstName || ''} ${stats.user.lastName || ''}`.trim()}</h2>
                </div>
                <DrawerClose asChild>
                  <button className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                    <X size={20} className="text-gray-600 dark:text-gray-300" />
                  </button>
                </DrawerClose>
              </div>
            ) : (
              <div className="flex gap-2 items-center w-full p-2 pl-6">
                {stats && !isCurrentUser && (
                  <button
                    onClick={handleToggleFavorite}
                    disabled={isBlocked}
                    className={`p-2 rounded-xl backdrop-blur-sm shadow-sm border ${
                      isBlocked
                        ? 'opacity-50 cursor-not-allowed bg-white/80 dark:bg-gray-800/80 border-gray-200/50 dark:border-gray-700/50'
                        : stats.user.isFavorite
                          ? 'bg-yellow-500 dark:bg-yellow-600 border-yellow-400 dark:border-yellow-500 hover:bg-yellow-600 dark:hover:bg-yellow-700'
                          : 'bg-white/80 dark:bg-gray-800/80 border-gray-200/50 dark:border-gray-700/50 hover:bg-white dark:hover:bg-gray-800'
                    }`}
                    title={isBlocked ? t('playerCard.userBlockedCannotFavorite') : (stats.user.isFavorite ? t('favorites.removeFromFavorites') : t('favorites.addToFavorites'))}
                  >
                    <Star size={16} className={stats.user.isFavorite ? 'text-white fill-white' : 'text-gray-400 hover:text-yellow-500 transition-colors'} />
                  </button>
                )}
                {stats && !isCurrentUser && (
                  <button
                    onClick={() => handleStartChat()}
                    className="px-4 py-2 rounded-xl text-white flex items-center gap-2 shadow-md bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                  >
                    <MessageCircle size={18} />
                    <span className="text-sm">{t('nav.chat')}</span>
                  </button>
                )}
                {stats && !isCurrentUser && (
                  <button
                    onClick={isBlocked ? handleBlockUser : () => setShowBlockConfirmation(true)}
                    disabled={blockingUser}
                    className={`px-4 py-2 rounded-xl text-white flex items-center gap-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
                      isBlocked ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700' : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700'
                    }`}
                    title={isBlocked ? t('playerCard.unblockUser') : t('playerCard.blockUser')}
                  >
                    {isBlocked ? <Check size={18} /> : <Ban size={18} className="scale-x-[-1]" />}
                  </button>
                )}
                <DrawerClose asChild>
                  <button className="p-2.5 ml-auto rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm hover:bg-white dark:hover:bg-gray-800 transition-all duration-200 shadow-sm hover:shadow-md border border-gray-200/50 dark:border-gray-700/50">
                    <X size={20} className="text-gray-600 dark:text-gray-300" />
                  </button>
                </DrawerClose>
              </div>
            )}

            <div className="flex flex-col min-h-0 flex-1 max-h-[calc(75vh-4rem)] overflow-y-auto" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))' }}>
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.div key="loading" className="flex items-center justify-center h-64" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                    <Loading />
                  </motion.div>
                ) : stats ? (
                  <>
                    {showAvatarView && stats.user.originalAvatar ? (
                      <motion.div key="avatar" className="flex-1 min-h-0 flex flex-col" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3, ease: 'easeInOut' }}>
                        <PlayerAvatarView stats={stats} />
                      </motion.div>
                    ) : (
                      <motion.div key="content" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
                        <PlayerCardContent
                          stats={stats}
                          t={t}
                          isBlocked={isBlocked}
                          onAvatarClick={() => { if (stats.user.originalAvatar) setShowAvatarView(true); }}
                          onTelegramClick={() => {
                            const getTelegramUrl = () => {
                              if (stats.user.telegramUsername) return `https://t.me/${stats.user.telegramUsername.replace('@', '')}`;
                              if (stats.user.telegramId) return `tg://user?id=${stats.user.telegramId}`;
                              return null;
                            };
                            const telegramUrl = getTelegramUrl();
                            if (telegramUrl && !isBlocked) window.open(telegramUrl, '_blank');
                          }}
                          onOpenGame={handleClose}
                          onMarketItemClick={(item) => { handleClose(); navigate(`/marketplace/${item.id}`); }}
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
  onTelegramClick: () => void;
  onOpenGame: () => void;
  onMarketItemClick?: (item: MarketItem) => void;
}

const PlayerCardContent = ({ stats, t, isBlocked, onAvatarClick, onTelegramClick, onOpenGame, onMarketItemClick }: PlayerCardContentProps) => {
  const { user } = stats;
  const isFavorite = useFavoritesStore((state) => state.isFavorite(user.id));
  const isOnline = usePresenceStore((state) => state.isOnline(user.id));
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  const hasTelegram = !!(user.telegramId || user.telegramUsername);

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.1 } } };
  const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const } } };

  return (
    <motion.div className="p-6 space-y-6 pt-2" variants={containerVariants} initial="hidden" animate="visible">
      <motion.div
        className={`relative h-48 rounded-2xl ${isBlocked ? 'bg-gradient-to-br from-red-500 to-red-700 dark:from-red-600 dark:to-red-800' : 'bg-gradient-to-br from-primary-500 to-primary-700 dark:from-primary-600 dark:to-primary-800'}`}
        variants={itemVariants}
      >
        {isOnline && (
          <span className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-full bg-white/95 dark:bg-gray-900/95 px-2 py-0.5 text-xs font-medium shadow border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400" aria-hidden />
            {t('playerCard.online')}
          </span>
        )}
        <div className="absolute inset-0 flex items-center justify-center gap-6">
          <div className="relative">
            {user.originalAvatar ? (
              <button onClick={onAvatarClick} className="cursor-pointer hover:opacity-90 transition-opacity">
                {user.avatar ? (
                  <img src={user.avatar || ''} alt={`${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User'} className={`w-32 h-32 rounded-full object-cover border-4 border-white dark:border-gray-800 shadow-xl ${isFavorite ? 'ring-[3px] ring-yellow-600 dark:ring-yellow-400' : ''}`} />
                ) : (
                  <div className={`w-32 h-32 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-5xl border-4 border-white dark:border-gray-800 shadow-xl ${isFavorite ? 'ring-[3px] ring-yellow-600 dark:ring-yellow-400' : ''}`}>{initials}</div>
                )}
              </button>
            ) : user.avatar ? (
              <img src={user.avatar || ''} alt={`${user.firstName} ${user.lastName}`} className={`w-32 h-32 rounded-full object-cover border-4 border-white dark:border-gray-800 shadow-xl ${isFavorite ? 'ring-[3px] ring-yellow-600 dark:ring-yellow-400' : ''}`} />
            ) : (
              <div className={`w-32 h-32 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-5xl border-4 border-white dark:border-gray-800 shadow-xl ${isFavorite ? 'ring-[3px] ring-yellow-600 dark:ring-yellow-400' : ''}`}>{initials}</div>
            )}
          </div>
          <div className="text-left text-white">
            {(user.isTrainer || user.gender) && (
              <div className="mb-2 flex items-center gap-2">
                {user.isTrainer && (
                  <div className="bg-blue-500 dark:bg-blue-600 text-white px-3 py-1 rounded-full font-semibold text-sm flex items-center gap-1.5 border-2 border-white dark:border-gray-900 w-fit" style={{ boxShadow: '0 6px 15px rgba(0, 0, 0, 0.4), 0 2px 6px rgba(0, 0, 0, 0.2)' }}>
                    <Dumbbell size={14} className="text-white" />
                    <span>{t('playerCard.isTrainer')}</span>
                  </div>
                )}
                <GenderIndicator gender={user.gender} layout="big" position="bottom-left" />
              </div>
            )}
            <h2 className="text-2xl font-bold">
              {user.firstName}
              {isBlocked && <span className="ml-2 text-lg font-semibold opacity-90">({t('playerCard.blocked') || 'Blocked'})</span>}
            </h2>
            {user.lastName && <h3 className="text-xl font-semibold">{user.lastName}</h3>}
            {user.verbalStatus && (
              <div className="mt-0 text-white/90 text-[9px] font-medium">
                {user.verbalStatus}
              </div>
            )}
          </div>
        </div>
        {hasTelegram && (
          <button
            onClick={onTelegramClick}
            disabled={isBlocked}
            className="absolute bottom-2 right-2 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-xl hover:scale-105 active:scale-95"
            style={{ backgroundColor: isBlocked ? '#9CA3AF' : '#229ED9' }}
            onMouseEnter={(e) => { if (!isBlocked) e.currentTarget.style.backgroundColor = '#1E8BC3'; }}
            onMouseLeave={(e) => { if (!isBlocked) e.currentTarget.style.backgroundColor = '#229ED9'; }}
            title={isBlocked ? t('playerCard.userBlockedCannotChat') : t('playerCard.openTelegramChat')}
          >
            <Send size={12} className="text-white flex-shrink-0" />
          </button>
        )}
      </motion.div>

      {stats.user.bio && (
        <motion.div variants={itemVariants} className="px-6 -mt-2">
          <p className="text-sm text-gray-600 dark:text-gray-400 italic">
            "{stats.user.bio}"
          </p>
        </motion.div>
      )}

      <motion.div variants={itemVariants}>
        <LevelHistoryView stats={stats} padding="p-0 -mt-2" tabDarkBgClass="dark:bg-gray-700/50" hideUserCard onOpenGame={onOpenGame} showItemsToSell onMarketItemClick={onMarketItemClick} />
      </motion.div>
    </motion.div>
  );
};
