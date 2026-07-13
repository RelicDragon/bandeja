import type { ReactNode } from 'react';
import { memo } from 'react';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Send, Dumbbell, BarChart3, Users } from 'lucide-react';
import type { TFunction } from 'i18next';
import { UserStats } from '@/api/users';
import { LevelHistoryView } from '@/components/LevelHistoryView';
import { GenderIndicator } from '@/components/GenderIndicator';
import { TrainerRatingBadge } from '@/components/TrainerRatingBadge';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';
import { useFavoritesStore } from '@/store/favoritesStore';
import { usePresenceStore } from '@/store/presenceStore';
import { PlayStreakChip } from '@/components/playStreak/PlayStreakChip';
import { useAuthStore } from '@/store/authStore';
import { MarketItem } from '@/types';
import { PlayerCardRatingStatus } from '@/components/player/PlayerCardRatingStatus';

export type PlayerCardProfileTab = 'statistics' | 'levels' | 'groups';

export interface PlayerCardProfileBodyProps {
  stats: UserStats;
  t: TFunction;
  isBlocked: boolean;
  showTelegram?: boolean;
  edgeToEdge?: boolean;
  prependBeforeLevelHistory?: ReactNode;
  showProfileTabs?: boolean;
  showGroupsTab?: boolean;
  activeProfileTab?: PlayerCardProfileTab;
  onProfileTabChange?: (tab: PlayerCardProfileTab) => void;
  groupsContent?: ReactNode;
  onAvatarClick: () => void;
  onRatingClick?: () => void;
  onTelegramClick: () => void;
  onOpenGame: () => void;
  onMarketItemClick?: (item: MarketItem) => void;
  onStatsRefresh?: (stats: UserStats) => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const } },
};

const PlayerCardProfileBodyComponent = ({
  stats,
  t,
  isBlocked,
  showTelegram = true,
  edgeToEdge = false,
  prependBeforeLevelHistory,
  showProfileTabs = false,
  showGroupsTab = true,
  activeProfileTab = 'statistics',
  onProfileTabChange,
  groupsContent,
  onAvatarClick,
  onRatingClick,
  onTelegramClick,
  onOpenGame,
  onMarketItemClick,
  onStatsRefresh,
}: PlayerCardProfileBodyProps) => {
  const { user } = stats;
  const authUserId = useAuthStore((s) => s.user?.id);
  const isAdmin = Boolean(useAuthStore((s) => s.user)?.isAdmin);
  const isOwnProfile = authUserId === user.id;
  const isFavorite = useFavoritesStore((state) => state.isFavorite(user.id));
  const isOnline = usePresenceStore((state) => state.isOnline(user.id));
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  const hasTelegram = showTelegram && !!(user.telegramId || (user.telegramUsername && user.telegramUsername.trim()));
  const playStreak = user.playStreak;

  const profileTabs = useMemo<SegmentedSwitchTab[]>(() => {
    const tabs: SegmentedSwitchTab[] = [
      { id: 'statistics', label: t('playerCard.statistics'), icon: BarChart3 },
      { id: 'levels', label: t('playerCard.levels'), icon: Dumbbell },
    ];

    if (showGroupsTab) {
      tabs.push({ id: 'groups', label: t('playerCard.groups'), icon: Users });
    }

    return tabs;
  }, [showGroupsTab, t]);
  const safeActiveProfileTab = activeProfileTab === 'groups' && !showGroupsTab ? 'statistics' : activeProfileTab;

  return (
    <motion.div className={`flex flex-col p-6 pt-2 ${prependBeforeLevelHistory ? 'gap-2' : 'gap-3'}`} variants={containerVariants} initial="hidden" animate="visible">
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
        <div className="absolute inset-0 flex items-center justify-center gap-6 px-4 overflow-hidden">
          <div className="relative shrink-0">
            {user.originalAvatar ? (
              <button type="button" onClick={onAvatarClick} className="cursor-pointer hover:opacity-90 transition-opacity">
                {user.avatar ? (
                  <img src={user.avatar || ''} alt={`${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User'} className={`w-32 h-32 shrink-0 rounded-full object-cover border-4 border-white dark:border-gray-800 shadow-xl ${isFavorite ? 'ring-[3px] ring-yellow-600 dark:ring-yellow-400' : ''}`} />
                ) : (
                  <div className={`w-32 h-32 shrink-0 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-5xl border-4 border-white dark:border-gray-800 shadow-xl ${isFavorite ? 'ring-[3px] ring-yellow-600 dark:ring-yellow-400' : ''}`}>{initials}</div>
                )}
              </button>
            ) : user.avatar ? (
              <img src={user.avatar || ''} alt={`${user.firstName} ${user.lastName}`} className={`w-32 h-32 shrink-0 rounded-full object-cover border-4 border-white dark:border-gray-800 shadow-xl ${isFavorite ? 'ring-[3px] ring-yellow-600 dark:ring-yellow-400' : ''}`} />
            ) : (
              <div className={`w-32 h-32 shrink-0 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-5xl border-4 border-white dark:border-gray-800 shadow-xl ${isFavorite ? 'ring-[3px] ring-yellow-600 dark:ring-yellow-400' : ''}`}>{initials}</div>
            )}
          </div>
          <div className="min-w-0 flex-1 text-left text-white">
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
            <h2 className="text-2xl font-bold break-words">
              {user.firstName}
              {isBlocked && <span className="ml-2 text-lg font-semibold opacity-90">({t('playerCard.blocked') || 'Blocked'})</span>}
            </h2>
            {user.lastName && <h3 className="text-xl font-semibold break-words">{user.lastName}</h3>}
            {user.verbalStatus && (
              <div className="mt-0 text-white/90 text-[9px] font-medium">
                {user.verbalStatus}
              </div>
            )}
            {user.isTrainer && (
              <div className="flex items-center gap-1 mt-1">
                <TrainerRatingBadge trainer={user} size="sm" showReviewCount={true} onClick={onRatingClick} variant="onPrimary" />
              </div>
            )}
            {playStreak && (playStreak.current > 0 || playStreak.best > 0) && (
              <div className="mt-2">
                <PlayStreakChip streak={playStreak} isOwn={isOwnProfile} />
              </div>
            )}
            <PlayerCardRatingStatus
              settling={Boolean(user.ratingSettling)}
              uncertainty={isAdmin ? user.ratingUncertainty : null}
              t={t}
            />
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

      {(!showProfileTabs || safeActiveProfileTab === 'statistics') && stats.user.bio && (
        <motion.div variants={itemVariants} className={edgeToEdge ? 'px-0' : 'px-6'}>
          <p className="text-sm text-gray-600 dark:text-gray-400 italic">
            {`"${stats.user.bio}"`}
          </p>
        </motion.div>
      )}

      {prependBeforeLevelHistory && (
        <motion.div variants={itemVariants}>
          {prependBeforeLevelHistory}
        </motion.div>
      )}

      {showProfileTabs && onProfileTabChange && (
        <motion.div variants={itemVariants} className="flex justify-center">
          <SegmentedSwitch
            tabs={profileTabs}
            activeId={safeActiveProfileTab}
            onChange={(id) => onProfileTabChange(id as PlayerCardProfileTab)}
            showOnlyActiveTabText={false}
            layoutId="player-card-profile-tabs"
            className="w-fit"
          />
        </motion.div>
      )}

      {showProfileTabs && safeActiveProfileTab === 'groups' ? (
        <motion.div variants={itemVariants}>
          {groupsContent}
        </motion.div>
      ) : (
        <motion.div variants={itemVariants}>
          <LevelHistoryView
            stats={stats}
            padding="p-0"
            tabDarkBgClass="dark:bg-gray-700/50"
            hideUserCard
            content={showProfileTabs && safeActiveProfileTab === 'levels' ? 'levels' : showProfileTabs ? 'statistics' : 'all'}
            onOpenGame={onOpenGame}
            showItemsToSell
            onMarketItemClick={onMarketItemClick}
            onStatsRefresh={onStatsRefresh}
          />
        </motion.div>
      )}
    </motion.div>
  );
};

export const PlayerCardProfileBody = memo(PlayerCardProfileBodyComponent);
