import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { usersApi, UserStats } from '@/api/users';
import { Loading } from './Loading';
import { LevelHistoryView } from './LevelHistoryView';
import { useAuthStore } from '@/store/authStore';

export const ProfileStatistics = () => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;

    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await usersApi.getUserStats(user.id);
        setStats(response.data);
      } catch (error) {
        console.error('Failed to fetch user stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [user?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loading />
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const { user: userData, gamesLast30Days } = stats;
  const winRate = userData.gamesPlayed > 0 ? ((userData.gamesWon / userData.gamesPlayed) * 100).toFixed(1) : '0';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.3 }}
      className="space-y-6"
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{userData.gamesPlayed}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">{t('playerCard.totalGames')}</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{gamesLast30Days}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">{t('playerCard.gamesLast30Days')}</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{userData.gamesWon}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">{t('playerCard.gamesWon')}</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{winRate}%</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">{t('playerCard.winRate')}</div>
        </div>
      </div>

      <LevelHistoryView stats={stats} padding="p-0" />
    </motion.div>
  );
};

