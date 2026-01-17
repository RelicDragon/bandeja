import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { rankingApi, LeaderboardEntry } from '@/api/ranking';
import { Loading } from './Loading';
import { PlayerAvatar } from './PlayerAvatar';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';
import toast from 'react-hot-toast';

export const ProfileLeaderboard = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { leaderboardType, leaderboardScope, leaderboardTimePeriod, areFiltersSticky, setLeaderboardScope, setLeaderboardTimePeriod, setAreFiltersSticky } = useHeaderStore();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);
  const userRowRef = useRef<HTMLTableRowElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);

  const getDecimals = (value: number) => {
    if (value === 0) return 2;
    const absValue = Math.abs(value);
    if (absValue < 0.01) {
      return Math.ceil(-Math.log10(absValue)) + 1;
    }
    return 2;
  };

  const formatNumber = (value: number) => {
    const formatted = value.toFixed(getDecimals(value));
    const absValue = Math.abs(value);
    if (absValue < 0.1 && absValue > 0) {
      return formatted.replace(/0+$/, '').replace(/\.$/, '');
    }
    return formatted;
  };

  const formatChange = (change: number) => {
    const formatted = formatNumber(change);
    return change > 0 ? `+${formatted}` : formatted;
  };

  const scrollToUser = () => {
    if (userRowRef.current) {
      const row = userRowRef.current;
      requestAnimationFrame(() => {
        const rowRect = row.getBoundingClientRect();
        const windowHeight = window.innerHeight;
        const rowHeight = rowRect.height;
        const scrollY = window.scrollY;
        const rowTop = rowRect.top + scrollY;
        const targetScroll = rowTop - (windowHeight / 2) + (rowHeight / 2);
        
        window.scrollTo({
          top: targetScroll,
          behavior: 'smooth',
        });
      });
    }
  };

  const userRank = leaderboard.find(entry => entry.id === user?.id)?.rank;

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setLoading(true);
        setIsScrolled(false);
        setAreFiltersSticky(false);
        const response = await rankingApi.getUserLeaderboardContext(leaderboardType, leaderboardScope, leaderboardType === 'games' ? leaderboardTimePeriod : undefined);
        setLeaderboard(response.data.leaderboard);
      } catch (error: any) {
        console.error('Failed to fetch leaderboard:', error);
        toast.error(error.response?.data?.message || t('errors.generic') || 'Failed to load leaderboard');
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [t, leaderboardType, leaderboardScope, leaderboardTimePeriod, setAreFiltersSticky]);

  useEffect(() => {
    if (!loading && leaderboard.length > 0 && !isScrolled) {
      const currentUserInLeaderboard = leaderboard.some(entry => entry.id === user?.id);
      
      if (currentUserInLeaderboard && userRowRef.current) {
        const row = userRowRef.current;
        requestAnimationFrame(() => {
          const rowRect = row.getBoundingClientRect();
          const windowHeight = window.innerHeight;
          const rowHeight = rowRect.height;
          const scrollY = window.scrollY;
          const rowTop = rowRect.top + scrollY;
          const targetScroll = rowTop - (windowHeight / 2) + (rowHeight / 2);
          
          window.scrollTo({
            top: targetScroll,
            behavior: 'smooth',
          });
          setIsScrolled(true);
          
          setTimeout(() => {
            if (filtersRef.current) {
              const filtersRect = filtersRef.current.getBoundingClientRect();
              const headerHeight = 64;
              const safeAreaTop = parseInt(getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-top)')) || 0;
              const threshold = headerHeight + safeAreaTop;
              setAreFiltersSticky(filtersRect.top < threshold);
            }
          }, 500);
        });
      } else {
        setIsScrolled(true);
      }
    }
  }, [loading, leaderboard, isScrolled, setAreFiltersSticky, user?.id]);

  useEffect(() => {
    const handleScroll = () => {
      if (!filtersRef.current) return;
      
      const filtersRect = filtersRef.current.getBoundingClientRect();
      const headerHeight = 64;
      const safeAreaTop = parseInt(getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-top)')) || 0;
      const threshold = headerHeight + safeAreaTop;
      
      setAreFiltersSticky(filtersRect.top < threshold);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, [setAreFiltersSticky]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loading />
      </div>
    );
  }

  if (leaderboard.length === 0) {
    return (
      <div className="text-center py-8 text-gray-600 dark:text-gray-400">
        {t('profile.noLeaderboardData') || 'No leaderboard data available'}
      </div>
    );
  }

  const renderTable = () => (
    <div className="overflow-x-auto overflow-y-auto h-full">
      <table className="w-full">
        <thead className="sticky top-0 bg-white dark:bg-gray-900 z-10">
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="w-14" />
            <th className="text-left py-2 pl-0 pr-0 text-xs font-semibold text-gray-700 dark:text-gray-300">
              <div className="-translate-x-2">
                {t('gameDetails.player') || 'Player'}
              </div>
            </th>
            <th className="text-right py-2 pl-0 pr-4 text-xs font-semibold text-gray-700 dark:text-gray-300">
              {leaderboardType === 'social' 
                ? (t('profile.social') || 'Social') 
                : leaderboardType === 'games' 
                ? (t('profile.games') || 'Games') 
                : (t('profile.level') || 'Level')}
            </th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.map((entry) => {
            const isCurrentUser = entry.id === user?.id;
            const displayValue = leaderboardType === 'games'
              ? (entry.gamesCount ?? 0).toString()
              : leaderboardType === 'social'
              ? entry.socialLevel.toFixed(1)
              : entry.level.toFixed(1);

            return (
              <tr
                key={entry.id}
                ref={isCurrentUser ? userRowRef : null}
                className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                  isCurrentUser ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                }`}
              >
                <td className="py-2 pl-0 pr-0">
                  <div className="flex items-center justify-center -translate-x-2">
                    <span
                      className={`text-sm font-medium ${
                        isCurrentUser
                          ? 'text-primary-600 dark:text-primary-400'
                          : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      {entry.rank}
                    </span>
                  </div>
                </td>
                <td className="py-2 pl-0 pr-0">
                  <div className="flex items-center gap-3 -translate-x-2">
                    <PlayerAvatar
                      player={entry}
                      extrasmall={true}
                      showName={false}
                      fullHideName={true}
                    />
                    <div className="text-sm text-gray-900 dark:text-white">
                      {[entry.firstName, entry.lastName].filter(Boolean).join(' ')}
                      {isCurrentUser && (
                        <span className="ml-2 text-xs text-primary-600 dark:text-primary-400">
                          ({t('profile.you')})
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-2 pl-0 pr-4 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {leaderboardType !== 'games' && entry.lastGameRatingChange !== null && entry.lastGameRatingChange !== undefined && (
                      <span
                        className={`text-[10px] font-medium px-1 py-0.5 rounded ${
                          entry.lastGameRatingChange > 0
                            ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                            : entry.lastGameRatingChange < 0
                            ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
                            : 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800'
                        }`}
                      >
                        {formatChange(entry.lastGameRatingChange)}
                      </span>
                    )}
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {displayValue}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const cityName = user?.currentCity?.name || 'City';

  return (
    <div className="space-y-4">
      {userRank && (
        <button
          onClick={scrollToUser}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-xl hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
        >
          <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
            {t('profile.myPlace', { rank: userRank, defaultValue: 'My place: {{rank}}' })}
          </span>
          <Search size={18} className="text-primary-600 dark:text-primary-400" />
        </button>
      )}
      <div ref={filtersRef} className={`space-y-4 ${areFiltersSticky ? 'opacity-0 pointer-events-none' : ''}`}>
        {leaderboardType === 'games' && (
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
            <button
              onClick={() => setLeaderboardTimePeriod('10')}
              className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ease-in-out ${
                leaderboardTimePeriod === '10'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              10 {t('profile.days') || 'Days'}
            </button>
            <button
              onClick={() => setLeaderboardTimePeriod('30')}
              className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ease-in-out ${
                leaderboardTimePeriod === '30'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              30 {t('profile.days') || 'Days'}
            </button>
            <button
              onClick={() => setLeaderboardTimePeriod('all')}
              className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ease-in-out ${
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
            className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ease-in-out ${
              leaderboardScope === 'city'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {cityName}
          </button>
          <button
            onClick={() => setLeaderboardScope('global')}
            className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ease-in-out ${
              leaderboardScope === 'global'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {t('profile.global') || 'Global'}
          </button>
        </div>
      </div>

      <div style={{ opacity: isScrolled || loading ? 1 : 0 }}>
        {renderTable()}
      </div>
    </div>
  );
};

