import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Beer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { UserStats } from '@/api/users';

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
}

export const LevelHistoryView = ({ stats }: LevelHistoryViewProps) => {
  const { t } = useTranslation();
  const { user, levelHistory, socialLevelHistory } = stats;
  const [showSocialLevel, setShowSocialLevel] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const handleToggle = () => {
    setIsAnimating(true);
    setShowSocialLevel(!showSocialLevel);
    setTimeout(() => setIsAnimating(false), 200);
  };

  const currentHistory = showSocialLevel ? (socialLevelHistory || []) : levelHistory;
  const currentValue = showSocialLevel ? (user.socialLevel || 1.0) : user.level;
  
  const maxLevel = currentHistory.length > 0 
    ? Math.max(...currentHistory.map(h => h.levelAfter), currentValue)
    : currentValue;
  const minLevel = currentHistory.length > 0
    ? Math.min(...currentHistory.map(h => h.levelAfter), currentValue)
    : currentValue;
  const levelRange = maxLevel - minLevel || 1;

  return (
    <div className="p-6 space-y-6">
      <div className="relative">
        <div className="bg-gradient-to-br from-primary-500 to-primary-700 dark:from-primary-600 dark:to-primary-800 rounded-2xl p-6 text-center">
          <div className="text-white text-sm mb-2">
            {showSocialLevel ? t('rating.socialLevel') : t('playerCard.currentLevel')}
          </div>
          <div className="text-white text-6xl font-bold">
            {showSocialLevel ? (user.socialLevel?.toFixed(2) || '1.00') : user.level.toFixed(2)}
          </div>
        </div>
        <button
          onClick={handleToggle}
          className="absolute top-4 right-4 w-8 h-8 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-md hover:shadow-lg transition-transform duration-200 flex items-center justify-center"
          style={{ transform: isAnimating ? 'scale(1.3)' : 'scale(1)' }}
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
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
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
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              {t('playerCard.recentChanges')}
            </h3>
            {currentHistory.slice().reverse().map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
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
                </div>
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

