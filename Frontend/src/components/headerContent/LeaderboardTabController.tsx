import { useTranslation } from 'react-i18next';
import { useHeaderStore } from '@/store/headerStore';

export const LeaderboardTabController = () => {
  const { t } = useTranslation();
  const { leaderboardType, setLeaderboardType } = useHeaderStore();

  return (
    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
      <button
        onClick={() => setLeaderboardType('level')}
        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
          leaderboardType === 'level'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        {t('profile.level') || 'Level'}
      </button>
      <button
        onClick={() => setLeaderboardType('social')}
        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
          leaderboardType === 'social'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        {t('profile.social') || 'Social'}
      </button>
      <button
        onClick={() => setLeaderboardType('games')}
        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
          leaderboardType === 'games'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        {t('profile.games') || 'Games'}
      </button>
    </div>
  );
};
