import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Send, Dumbbell } from 'lucide-react';
import type { TFunction } from 'i18next';
import { UserStats } from '@/api/users';
import { LevelHistoryView } from '@/components/LevelHistoryView';
import { GenderIndicator } from '@/components/GenderIndicator';
import { TrainerRatingBadge } from '@/components/TrainerRatingBadge';
import { useFavoritesStore } from '@/store/favoritesStore';
import { usePresenceStore } from '@/store/presenceStore';
import { MarketItem } from '@/types';

export interface PlayerCardProfileBodyProps {
  stats: UserStats;
  t: TFunction;
  isBlocked: boolean;
  showTelegram?: boolean;
  edgeToEdge?: boolean;
  prependBeforeLevelHistory?: ReactNode;
  onAvatarClick: () => void;
  onRatingClick?: () => void;
  onTelegramClick: () => void;
  onOpenGame: () => void;
  onMarketItemClick?: (item: MarketItem) => void;
}

export const PlayerCardProfileBody = ({
  stats,
  t,
  isBlocked,
  showTelegram = true,
  edgeToEdge = false,
  prependBeforeLevelHistory,
  onAvatarClick,
  onRatingClick,
  onTelegramClick,
  onOpenGame,
  onMarketItemClick,
}: PlayerCardProfileBodyProps) => {
  const { user } = stats;
  const isFavorite = useFavoritesStore((state) => state.isFavorite(user.id));
  const isOnline = usePresenceStore((state) => state.isOnline(user.id));
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  const hasTelegram = showTelegram && !!(user.telegramId || (user.telegramUsername && user.telegramUsername.trim()));

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
              <button type="button" onClick={onAvatarClick} className="cursor-pointer hover:opacity-90 transition-opacity">
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
            {user.isTrainer && (
              <div className="flex items-center gap-1 mt-1 text-amber-300">
                <TrainerRatingBadge trainer={user} size="sm" showReviewCount={true} onClick={onRatingClick} />
              </div>
            )}
          </div>
        </div>
        {hasTelegram && (
          <button
            type="button"
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
        <motion.div variants={itemVariants} className={`${edgeToEdge ? 'px-0' : 'px-6'} -mt-2`}>
          <p className="text-sm text-gray-600 dark:text-gray-400 italic">
            {`"${stats.user.bio}"`}
          </p>
        </motion.div>
      )}

      {prependBeforeLevelHistory}

      <motion.div variants={itemVariants}>
        <LevelHistoryView stats={stats} padding="p-0 -mt-2" tabDarkBgClass="dark:bg-gray-700/50" hideUserCard onOpenGame={onOpenGame} showItemsToSell onMarketItemClick={onMarketItemClick} />
      </motion.div>
    </motion.div>
  );
};
