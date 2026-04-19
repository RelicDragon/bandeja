import { useEffect, useState, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, ChevronDown, X } from 'lucide-react';
import { motion } from 'framer-motion';
import transliterate from '@sindresorhus/transliterate';
import { rankingApi, LeaderboardEntry } from '@/api/ranking';
import { Loading } from './Loading';
import { PlayerAvatar } from './PlayerAvatar';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';
import { isAndroid } from '@/utils/capacitor';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';
import toast from 'react-hot-toast';

export const ProfileLeaderboard = () => {
  const { t } = useTranslation();
  const { translateCity } = useTranslatedGeo();
  const { user } = useAuthStore();
  const { leaderboardType, leaderboardScope, leaderboardTimePeriod, areFiltersSticky, setLeaderboardScope, setLeaderboardTimePeriod, setAreFiltersSticky } = useHeaderStore();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const userRowRef = useRef<HTMLTableRowElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);

  const formatRatingDelta = (change: number) => {
    const s = change.toFixed(2);
    return change > 0 ? `+${s}` : s;
  };

  const scrollToUser = () => {
    const userInFiltered = filteredLeaderboard.some(entry => entry.id === user?.id);
    if (!userInFiltered && searchQuery) {
      setSearchQuery('');
      setTimeout(() => doScrollToUser(), 150);
      return;
    }
    doScrollToUser();
  };

  const scrollBehavior = isAndroid() ? 'auto' : 'smooth';

  const doScrollToUser = () => {
    if (!userRowRef.current) return;
    requestAnimationFrame(() => {
      userRowRef.current?.scrollIntoView({ behavior: scrollBehavior, block: 'center' });
    });
  };

  const normalizeString = (str: string) => {
    return transliterate(str).toLowerCase();
  };

  const filteredLeaderboard = useMemo(() => {
    if (!searchQuery.trim()) {
      return leaderboard;
    }
    
    const normalized = normalizeString(searchQuery);
    
    return leaderboard.filter((entry) => {
      const fullName = `${entry.firstName || ''} ${entry.lastName || ''}`.trim();
      return normalizeString(fullName).includes(normalized);
    });
  }, [leaderboard, searchQuery]);

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
          row.scrollIntoView({ behavior: scrollBehavior, block: 'center' });
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
  }, [loading, leaderboard, isScrolled, setAreFiltersSticky, user?.id, scrollBehavior]);

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
    <div className="-ml-1 w-[calc(100%+1rem)] min-w-0 max-w-[calc(100%+1rem)] overflow-x-hidden">
      <table className="w-full min-w-0 table-fixed">
        <colgroup>
          <col className="w-9" />
          <col />
          <col className="w-[5.25rem] sm:w-28" />
        </colgroup>
        <thead className="sticky top-0 bg-white dark:bg-gray-900 z-10">
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="px-0 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300" />
            <th className="min-w-0 py-2 pl-0 pr-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">
              {t('gameDetails.player') || 'Player'}
            </th>
            <th className="whitespace-nowrap py-2 pl-2 pr-0 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">
              {leaderboardType === 'social' 
                ? (t('profile.social') || 'Social') 
                : leaderboardType === 'games' 
                ? (t('profile.games') || 'Games') 
                : (t('profile.level') || 'Level')}
            </th>
          </tr>
        </thead>
        <tbody>
          {filteredLeaderboard.map((entry) => {
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
                <td className="px-0 py-2 text-left align-middle">
                  <span
                    className={`text-xs font-medium tabular-nums ${
                      isCurrentUser
                        ? 'text-primary-600 dark:text-primary-400'
                        : 'text-gray-900 dark:text-white'
                    }`}
                  >
                    {entry.rank}
                  </span>
                </td>
                <td className="min-w-0 py-2 pl-0 pr-2 align-middle">
                  <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                      <PlayerAvatar
                        player={entry}
                        extrasmall={true}
                        showName={false}
                        fullHideName={true}
                      />
                    </div>
                    <div className="min-w-0 w-full flex-1">
                      <div className="line-clamp-2 min-w-0 break-words text-xs text-gray-900 dark:text-white">
                        {[entry.firstName, entry.lastName].filter(Boolean).join(' ')}
                        {isCurrentUser && (
                          <span className="ml-1.5 text-[10px] text-primary-600 dark:text-primary-400">
                            ({t('profile.you')})
                          </span>
                        )}
                      </div>
                      {entry.verbalStatus && (
                        <p className="verbal-status line-clamp-2 break-words">
                          {entry.verbalStatus}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap py-2 pl-2 pr-0 text-right align-middle">
                  <div className="flex items-center justify-end gap-1">
                    {leaderboardType !== 'games' &&
                      entry.lastGameRatingChange !== null &&
                      entry.lastGameRatingChange !== undefined && (
                        <span
                          className={`rounded px-1 py-0.5 text-[10px] font-medium tabular-nums ${
                            entry.lastGameRatingChange > 0
                              ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                              : entry.lastGameRatingChange < 0
                                ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                                : 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                          }`}
                        >
                          {formatRatingDelta(entry.lastGameRatingChange)}
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

  const cityName = user?.currentCity
    ? translateCity(user.currentCity.id, user.currentCity.name, user.currentCity.country)
    : 'City';

  const handleSearchFocus = () => {
    setIsSearchFocused(true);
  };

  const handleSearchBlur = () => {
    if (!searchQuery) {
      setIsSearchFocused(false);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setIsSearchFocused(false);
  };

  return (
    <div className="min-w-0 space-y-4">
      {userRank && (
        <div className="flex min-w-0 items-center gap-2">
          <motion.button
            onClick={scrollToUser}
            layout
            className={`flex min-w-0 items-center justify-between gap-1.5 ${isSearchFocused ? 'px-0' : 'px-2.5'} py-2 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-xl hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors overflow-hidden`}
            animate={{
              opacity: isSearchFocused ? 0 : 1,
              scale: isSearchFocused ? 0.95 : 1,
            }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 30,
            }}
            style={{
              flex: isSearchFocused ? '0 0 0' : '1 1 0',
              minWidth: isSearchFocused ? 0 : undefined,
              pointerEvents: isSearchFocused ? 'none' : 'auto',
            }}
          >
            <span className="min-w-0 flex-1 truncate text-left text-xs font-medium text-primary-700 dark:text-primary-300">
              {t('profile.myPlace', { rank: userRank, defaultValue: 'My place: {{rank}}' })}
            </span>
            <ChevronDown size={14} className="shrink-0 text-primary-600 dark:text-primary-400" />
          </motion.button>
          <motion.div
            layout
            className="relative min-w-0"
            animate={{
              flex: isSearchFocused ? '2 1 0' : '1 1 0',
            }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 30,
            }}
          >
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={16} />
            <input
              type="text"
              placeholder={t('chat.search', { defaultValue: 'Search' })}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={handleSearchFocus}
              onBlur={handleSearchBlur}
              className="w-full min-w-0 rounded-full border border-gray-300 bg-white py-1.5 pl-8 pr-8 text-xs text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-400 dark:focus:ring-blue-400"
            />
            {searchQuery && (
              <button
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Clear search"
              >
                <X size={14} className="text-gray-400 dark:text-gray-500" />
              </button>
            )}
          </motion.div>
        </div>
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

