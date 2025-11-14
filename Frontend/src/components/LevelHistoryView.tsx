import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Beer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useState, useEffect, useMemo } from 'react';
import { UserStats, usersApi, LevelHistoryItem } from '@/api/users';
import { gamesApi } from '@/api/games';
import { canUserSeeGame } from '@/utils/gameResults';
import { useAuthStore } from '@/store/authStore';
import { useNavigationStore } from '@/store/navigationStore';
import { LevelHistoryTabController } from './LevelHistoryTabController';

const TennisBallIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 69.447 69.447"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g transform="translate(-1271.769 -1574.648)">
      <path d="M1341.208,1609.372a34.719,34.719,0,1,1-34.72-34.724A34.724,34.724,0,0,1,1341.208,1609.372Z" fill="#b9d613"/>
      <path d="M1311.144,1574.993a35.139,35.139,0,0,0-4.61-.344,41.069,41.069,0,0,1-34.369,29.735,34.3,34.3,0,0,0-.381,4.635l.183-.026a45.921,45.921,0,0,0,39.149-33.881Zm29.721,34.692a45.487,45.487,0,0,0-33.488,34.054l-.071.313a34.54,34.54,0,0,0,4.818-.455,41.218,41.218,0,0,1,28.686-29.194,36.059,36.059,0,0,0,.388-4.8Z" fill="#f7f7f7"/>
    </g>
  </svg>
);

interface LevelHistoryViewProps {
  stats: UserStats;
  padding?: 'p-6' | 'p-0';
  tabDarkBgClass?: string;
}

export const LevelHistoryView = ({ stats, padding = 'p-6', tabDarkBgClass }: LevelHistoryViewProps) => {
  const { t } = useTranslation();
  const currentUser = useAuthStore((state) => state.user);
  const { setCurrentPage, setIsAnimating } = useNavigationStore();
  const { user, levelHistory, socialLevelHistory } = stats;
  const [showSocialLevel, setShowSocialLevel] = useState(false);
  const [isToggleAnimating, setIsToggleAnimating] = useState(false);
  const [showingPrivateMessage, setShowingPrivateMessage] = useState<string | null>(null);
  const [levelChangeEvents, setLevelChangeEvents] = useState<LevelHistoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<'10' | '30' | 'all'>('10');

  useEffect(() => {
    const fetchLevelChanges = async () => {
      try {
        const response = await usersApi.getUserLevelChanges(user.id);
        setLevelChangeEvents(response.data);
      } catch (error) {
        console.error('Failed to fetch level changes:', error);
      }
    };

    fetchLevelChanges();
  }, [user.id]);

  const handleToggle = () => {
    setIsToggleAnimating(true);
    setShowSocialLevel(!showSocialLevel);
    setTimeout(() => setIsToggleAnimating(false), 200);
  };

  const handleRatingChangeClick = async (item: { id: string; gameId: string }) => {
    if (!item.gameId) return;

    try {
      const response = await gamesApi.getById(item.gameId);
      const game = response.data;

      if (canUserSeeGame(game, currentUser)) {
        setIsAnimating(true);
        setCurrentPage('gameDetails');
        window.location.href = `/games/${item.gameId}`;
      } else {
        setShowingPrivateMessage(item.id);
        setTimeout(() => {
          setShowingPrivateMessage(null);
        }, 2000);
      }
    } catch (error) {
      setShowingPrivateMessage(item.id);
      setTimeout(() => {
        setShowingPrivateMessage(null);
      }, 2000);
    }
  };

  const baseHistory = showSocialLevel ? (socialLevelHistory || []) : levelHistory;
  
  const allMergedHistory = useMemo(() => {
    const merged = [...baseHistory, ...levelChangeEvents]
      .map(item => ({
        ...item,
        createdAt: new Date(item.createdAt).toISOString(),
      }))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    
    const unique = merged.filter((item, index, self) => 
      index === self.findIndex(t => t.id === item.id)
    );
    
    return unique;
  }, [baseHistory, levelChangeEvents]);

  const currentHistory = useMemo(() => {
    if (activeTab === 'all') {
      return allMergedHistory;
    }
    const limit = activeTab === '10' ? 10 : 30;
    return allMergedHistory.slice(-limit);
  }, [allMergedHistory, activeTab]);
  const currentValue = showSocialLevel ? (user.socialLevel || 1.0) : user.level;
  
  const maxLevel = currentHistory.length > 0 
    ? Math.max(...currentHistory.map(h => h.levelAfter), currentValue)
    : currentValue;
  const minLevel = currentHistory.length > 0
    ? Math.min(...currentHistory.map(h => h.levelAfter), currentValue)
    : currentValue;
  const levelRange = maxLevel - minLevel || 1;

  return (
    <div className={`${padding} space-y-3`}>
      <div className="relative">
        <div className="bg-gradient-to-br from-primary-500 to-primary-700 dark:from-primary-600 dark:to-primary-800 rounded-2xl p-4 text-center">
          <div className="text-white text-sm mb-1">
            {showSocialLevel ? t('rating.socialLevel') : t('playerCard.currentLevel')}
          </div>
          <div className="text-white text-6xl font-bold">
            {showSocialLevel ? (user.socialLevel?.toFixed(2) || '1.00') : user.level.toFixed(2)}
          </div>
        </div>
        <button
          onClick={handleToggle}
          className="absolute top-3 right-3 w-8 h-8 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-md hover:shadow-lg transition-transform duration-200 flex items-center justify-center"
          style={{ transform: isToggleAnimating ? 'scale(1.3)' : 'scale(1)' }}
          title={showSocialLevel ? t('playerCard.switchToLevel') : t('playerCard.switchToSocialLevel')}
        >
          {showSocialLevel ? (
            <TennisBallIcon />
          ) : (
            <Beer size={20} className="text-amber-600" />
          )}
        </button>
      </div>

      {currentHistory.length > 0 ? (
        <>
          <LevelHistoryTabController activeTab={activeTab} onTabChange={setActiveTab} darkBgClass={tabDarkBgClass} />
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
            <div className="relative h-48">
              <svg className="w-full h-full" viewBox="0 0 300 150" preserveAspectRatio="none">
                <defs>
                  {showSocialLevel ? (
                    <linearGradient id="socialLevelGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="rgb(251, 191, 36)" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="rgb(251, 191, 36)" stopOpacity="0.05" />
                    </linearGradient>
                  ) : (
                    <linearGradient id="levelGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity="0.05" />
                    </linearGradient>
                  )}
                </defs>

                <polyline
                  fill={showSocialLevel ? "url(#socialLevelGradient)" : "url(#levelGradient)"}
                  stroke="none"
                  points={currentHistory.map((item, index) => {
                    const x = (index / (currentHistory.length - 1 || 1)) * 300;
                    const normalizedLevel = ((item.levelAfter - minLevel) / levelRange);
                    const y = 150 - (normalizedLevel * 130 + 10);
                    return `${x},${y}`;
                  }).join(' ') + ` 300,150 0,150`}
                />

                <polyline
                  fill="none"
                  stroke={showSocialLevel ? "rgb(251, 191, 36)" : "rgb(59, 130, 246)"}
                  strokeWidth="2"
                  points={currentHistory.map((item, index) => {
                    const x = (index / (currentHistory.length - 1 || 1)) * 300;
                    const normalizedLevel = ((item.levelAfter - minLevel) / levelRange);
                    const y = 150 - (normalizedLevel * 130 + 10);
                    return `${x},${y}`;
                  }).join(' ')}
                />

                {currentHistory.map((item, index) => {
                  const x = (index / (currentHistory.length - 1 || 1)) * 300;
                  const normalizedLevel = ((item.levelAfter - minLevel) / levelRange);
                  const y = 150 - (normalizedLevel * 130 + 10);
                  return (
                    <circle
                      key={item.id}
                      cx={x}
                      cy={y}
                      r="4"
                      fill={showSocialLevel ? "rgb(251, 191, 36)" : "rgb(59, 130, 246)"}
                    />
                  );
                })}
              </svg>
              
              <div className="absolute top-0 left-0 text-xs text-gray-500 dark:text-gray-400">
                {maxLevel.toFixed(2)}
              </div>
              <div className="absolute bottom-0 left-0 text-xs text-gray-500 dark:text-gray-400">
                {minLevel.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {activeTab === '10' ? t('playerCard.last10EventsTitle') : 
               activeTab === '30' ? t('playerCard.last30EventsTitle') : 
               t('playerCard.allEventsTitle')}
            </h3>
            {currentHistory.slice().reverse().map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors relative"
                onClick={() => handleRatingChangeClick(item)}
              >
                <AnimatePresence mode="wait">
                  {showingPrivateMessage === item.id ? (
                    <motion.div
                      key="private-message"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.3 }}
                      className="flex items-center justify-center h-full absolute inset-0"
                    >
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t('playerCard.gameIsPrivate')}
                      </span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="rating-change"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.3 }}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                        {item.eventType && (
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                            {t(`playerCard.eventType.${item.eventType}`)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-700 dark:text-gray-300 font-medium">
                          {item.levelBefore.toFixed(2)} → {item.levelAfter.toFixed(2)}
                        </span>
                        <div className={`flex items-center ${item.levelChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {item.levelChange >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                          <span className="font-semibold ml-1">
                            {item.levelChange >= 0 ? '+' : ''}{item.levelChange.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          {showSocialLevel ? t('playerCard.noSocialLevelHistory') : t('playerCard.noLevelHistory')}
        </div>
      )}
    </div>
  );
};

