import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHeaderStore } from '@/store/headerStore';
import { useAuthStore } from '@/store/authStore';

export const ProfileHeaderContent = () => {
  const { t } = useTranslation();
  const [isAnimating, setIsAnimating] = useState(false);
  const { leaderboardType, leaderboardScope, leaderboardTimePeriod, areFiltersSticky, setLeaderboardType, setLeaderboardScope, setLeaderboardTimePeriod } = useHeaderStore();
  const { user } = useAuthStore();
  const cityName = user?.currentCity?.name || 'City';

  const handleLogoClick = () => {
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 1200);
  };

  return (
    <>
      <style>{`
        @keyframes logoBounce {
          0% { transform: rotate(0deg) scale(1); }
          10% { transform: rotate(15deg) scale(1.15); }
          20% { transform: rotate(0deg) scale(1); }
          30% { transform: rotate(10deg) scale(1.1); }
          40% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(6deg) scale(1.06); }
          60% { transform: rotate(0deg) scale(1); }
          70% { transform: rotate(3deg) scale(1.03); }
          80% { transform: rotate(0deg) scale(1); }
          90% { transform: rotate(1deg) scale(1.01); }
          100% { transform: rotate(0deg) scale(1); }
        }
        .logo-bounce {
          animation: logoBounce 1.2s ease-out;
        }
      `}</style>
      <div className="flex items-center gap-4">
        {!areFiltersSticky && (
          <img 
            src="/bandeja-blue-flat-small.png" 
            alt="Bandeja Logo" 
            className={`h-12 cursor-pointer select-none ${isAnimating ? 'logo-bounce' : ''}`}
            onClick={handleLogoClick}
          />
        )}
        {areFiltersSticky && (
          <div className={`flex ${leaderboardType === 'games' ? 'flex-col' : 'items-center'} gap-2`}>
            <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-xl -pb-2 pt-2">
              <button
                onClick={() => setLeaderboardType('level')}
                className={`rounded-lg font-semibold text-xs transition-all duration-300 ease-in-out ${
                  leaderboardType === 'level'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {t('profile.level') || 'Level'}
              </button>
              <button
                onClick={() => setLeaderboardType('social')}
                className={`rounded-lg font-semibold text-xs transition-all duration-300 ease-in-out ${
                  leaderboardType === 'social'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {t('profile.social') || 'Social'}
              </button>
              <button
                onClick={() => setLeaderboardType('games')}
                className={`rounded-lg font-semibold text-xs transition-all duration-300 ease-in-out ${
                  leaderboardType === 'games'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {t('profile.games') || 'Games'}
              </button>
            </div>
            {leaderboardType === 'games' && (
              <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-xl -pt-2">
                <button
                  onClick={() => setLeaderboardTimePeriod('10')}
                  className={`rounded-lg font-semibold text-xs transition-all duration-300 ease-in-out ${
                    leaderboardTimePeriod === '10'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  10 {t('profile.days') || 'Days'}
                </button>
                <button
                  onClick={() => setLeaderboardTimePeriod('30')}
                  className={`rounded-lg font-semibold text-xs transition-all duration-300 ease-in-out ${
                    leaderboardTimePeriod === '30'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  30 {t('profile.days') || 'Days'}
                </button>
                <button
                  onClick={() => setLeaderboardTimePeriod('all')}
                  className={`rounded-lg font-semibold text-xs transition-all duration-300 ease-in-out ${
                    leaderboardTimePeriod === 'all'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {t('profile.all') || 'All'}
                </button>
              </div>
            )}
            <div className="hidden flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
              <button
                onClick={() => setLeaderboardScope('city')}
                className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition-all duration-300 ease-in-out ${
                  leaderboardScope === 'city'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {cityName}
              </button>
              <button
                onClick={() => setLeaderboardScope('global')}
                className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition-all duration-300 ease-in-out ${
                  leaderboardScope === 'global'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {t('profile.global') || 'Global'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
