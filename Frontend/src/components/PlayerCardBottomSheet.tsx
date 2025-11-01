import { useEffect, useState } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { X, TrendingUp, TrendingDown, Beer, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usersApi, UserStats } from '@/api/users';
import { favoritesApi } from '@/api/favorites';
import { Loading } from './Loading';
import { CachedImage } from './CachedImage';
import { UrlConstructor } from '@/utils/urlConstructor';
import { PlayerAvatarView } from './PlayerAvatarView';
import { GenderIndicator } from './GenderIndicator';
import toast from 'react-hot-toast';

interface PlayerCardBottomSheetProps {
  playerId: string | null;
  onClose: () => void;
}

export const PlayerCardBottomSheet = ({ playerId, onClose }: PlayerCardBottomSheetProps) => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [showAvatarView, setShowAvatarView] = useState(false);

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

    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await usersApi.getUserStats(playerId);
        console.log('User stats loaded:', response.data);
        console.log('User originalAvatar:', response.data.user.originalAvatar);
        setStats(response.data);
      } catch (error) {
        console.error('Failed to fetch user stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [playerId]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 300);
  };

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
    if (!playerId || !stats) return;

    try {
      if (stats.user.isFavorite) {
        await favoritesApi.removeUserFromFavorites(playerId);
        setStats({ ...stats, user: { ...stats.user, isFavorite: false } });
        toast.success(t('favorites.userRemovedFromFavorites'));
      } else {
        await favoritesApi.addUserToFavorites(playerId);
        setStats({ ...stats, user: { ...stats.user, isFavorite: true } });
        toast.success(t('favorites.userAddedToFavorites'));
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  if (!playerId) return null;

  // Calculate dynamic blur based on drag position
  const maxBlur = 8;
  const maxDrag = window.innerHeight * 0.3; // Maximum drag distance for full deblur
  const blurValue = Math.max(0, maxBlur - (dragY / maxDrag) * maxBlur);

  return (
    <AnimatePresence>
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
          className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-3xl shadow-2xl max-h-[95vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="h-8 w-full cursor-grab active:cursor-grabbing" />
          
          <div className="absolute top-4 right-4 flex gap-2 z-10">
            {stats && (
              <button
                onClick={onToggleFavorite}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title={stats.user.isFavorite ? t('favorites.removeFromFavorites') : t('favorites.addToFavorites')}
              >
                <Star
                  size={20}
                  className={stats.user.isFavorite
                    ? 'text-yellow-500 fill-yellow-500'
                    : 'text-gray-400 hover:text-yellow-500'
                  }
                />
              </button>
            )}
            <button
              onClick={handleClose}
              className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <X size={20} className="text-gray-600 dark:text-gray-300" />
            </button>
          </div>

          <div className="overflow-y-auto max-h-[calc(95vh-20px)]">
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
                      onAvatarClick={() => {
                        console.log('Avatar clicked!', stats.user.originalAvatar);
                        if (stats.user.originalAvatar) {
                          setShowAvatarView(true);
                        }
                      }}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            ) : null}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

interface PlayerCardContentProps {
  stats: UserStats;
  t: (key: string) => string;
  onAvatarClick: () => void;
  onToggleFavorite: () => void;
}

const PlayerCardContent = ({ stats, t, onAvatarClick, onToggleFavorite }: PlayerCardContentProps) => {
  const { user, levelHistory, gamesLast30Days } = stats;
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  const winRate = user.gamesPlayed > 0 ? ((user.gamesWon / user.gamesPlayed) * 100).toFixed(1) : '0';

  const maxLevel = Math.max(...levelHistory.map(h => h.levelAfter), user.level);
  const minLevel = Math.min(...levelHistory.map(h => h.levelAfter), user.level);
  const levelRange = maxLevel - minLevel || 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.3 }}
      className="p-6 space-y-6"
    >
      <div className="relative h-48 bg-gradient-to-br from-primary-500 to-primary-700 dark:from-primary-600 dark:to-primary-800 rounded-2xl">
        <div className="absolute inset-0 flex items-center justify-center gap-6">
          <div className="relative">
            {user.originalAvatar ? (
              <button
                onClick={onAvatarClick}
                className="cursor-pointer hover:opacity-90 transition-opacity"
              >
                {user.avatar ? (
                  <CachedImage
                    src={UrlConstructor.constructImageUrl(user.avatar)}
                    alt={`${user.firstName} ${user.lastName}`}
                    className="w-32 h-32 rounded-full object-cover border-4 border-white dark:border-gray-800 shadow-xl"
                  />
                ) : (
                  <div className="w-32 h-32 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-5xl border-4 border-white dark:border-gray-800 shadow-xl">
                    {initials}
                  </div>
                )}
              </button>
            ) : user.avatar ? (
              <CachedImage
                src={UrlConstructor.constructImageUrl(user.avatar)}
                alt={`${user.firstName} ${user.lastName}`}
                className="w-32 h-32 rounded-full object-cover border-4 border-white dark:border-gray-800 shadow-xl"
              />
            ) : (
              <div className="w-32 h-32 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-5xl border-4 border-white dark:border-gray-800 shadow-xl">
                {initials}
              </div>
            )}
            <div className="absolute -bottom-1 left-3">
              <GenderIndicator gender={user.gender} layout="big" position="bottom-left" />
            </div>
          </div>
          <div className="text-left text-white">
            <h2 className="text-2xl font-bold">
              {user.firstName}
            </h2>
            {user.lastName && (
              <h3 className="text-xl font-semibold">
                {user.lastName}
              </h3>
            )}
          </div>
        </div>
        <div className="absolute bottom-5 left-1/2 transform -translate-x-1/2 bg-yellow-500 dark:bg-yellow-600 text-white px-3 py-1.5 rounded-full font-bold text-sm shadow-lg flex items-center gap-1">
          <span>{user.level.toFixed(1)}</span>
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
          <span>{user.socialLevel?.toFixed(1) || '1.0'}</span>
        </div>
        {user.isTrainer && (
          <div className="absolute top-3 left-3 bg-green-500 dark:bg-green-600 text-white px-3 py-1 rounded-full font-semibold text-sm shadow-lg">
            {t('playerCard.isTrainer')}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{user.gamesPlayed}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">{t('playerCard.totalGames')}</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{gamesLast30Days}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">{t('playerCard.gamesLast30Days')}</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{user.gamesWon}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">{t('playerCard.gamesWon')}</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{winRate}%</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">{t('playerCard.winRate')}</div>
        </div>
      </div>

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

      {levelHistory.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t('playerCard.levelHistory')}
          </h3>
          <div className="relative h-40">
            <svg className="w-full h-full" viewBox="0 0 300 120" preserveAspectRatio="none">
              <defs>
                <linearGradient id="levelGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity="0.05" />
                </linearGradient>
              </defs>

              <polyline
                fill="url(#levelGradient)"
                stroke="none"
                points={levelHistory.map((item, index) => {
                  const x = (index / (levelHistory.length - 1 || 1)) * 300;
                  const normalizedLevel = ((item.levelAfter - minLevel) / levelRange);
                  const y = 120 - (normalizedLevel * 100 + 10);
                  return `${x},${y}`;
                }).join(' ') + ` 300,120 0,120`}
              />

              <polyline
                fill="none"
                stroke="rgb(59, 130, 246)"
                strokeWidth="2"
                points={levelHistory.map((item, index) => {
                  const x = (index / (levelHistory.length - 1 || 1)) * 300;
                  const normalizedLevel = ((item.levelAfter - minLevel) / levelRange);
                  const y = 120 - (normalizedLevel * 100 + 10);
                  return `${x},${y}`;
                }).join(' ')}
              />

              {levelHistory.map((item, index) => {
                const x = (index / (levelHistory.length - 1 || 1)) * 300;
                const normalizedLevel = ((item.levelAfter - minLevel) / levelRange);
                const y = 120 - (normalizedLevel * 100 + 10);
                return (
                  <circle
                    key={item.id}
                    cx={x}
                    cy={y}
                    r="3"
                    fill="rgb(59, 130, 246)"
                  />
                );
              })}
            </svg>
            
            <div className="absolute top-0 left-0 text-xs text-gray-500 dark:text-gray-400">
              {maxLevel.toFixed(1)}
            </div>
            <div className="absolute bottom-0 left-0 text-xs text-gray-500 dark:text-gray-400">
              {minLevel.toFixed(1)}
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {levelHistory.slice(-3).reverse().map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">
                  {new Date(item.createdAt).toLocaleDateString()}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-700 dark:text-gray-300 font-medium">
                    {item.levelBefore.toFixed(1)} → {item.levelAfter.toFixed(1)}
                  </span>
                  <div className={`flex items-center ${item.levelChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {item.levelChange >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                    <span className="font-semibold ml-1">
                      {item.levelChange >= 0 ? '+' : ''}{item.levelChange.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
};
