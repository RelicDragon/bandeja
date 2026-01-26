import { useTranslation } from 'react-i18next';
import { GamesStat } from '@/api/users';

interface GamesStatsSectionProps {
  stats: GamesStat[];
  activeTab: '30' | '90' | 'all';
  onTabChange: (tab: '30' | '90' | 'all') => void;
  onLevelClick?: () => void;
  darkBgClass?: string;
}

export const GamesStatsSection = ({ stats, activeTab, onTabChange, onLevelClick, darkBgClass = 'dark:bg-gray-700/50' }: GamesStatsSectionProps) => {
  const { t } = useTranslation();

  const currentStat = stats.find(s => s.type === activeTab);
  if (!currentStat) return null;

  const content = (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div>
          <div className="text-lg font-bold text-green-600 dark:text-green-400">
            {currentStat.wins}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('playerCard.winsShort')}</div>
        </div>
        <div>
          <div className="text-lg font-bold text-yellow-600 dark:text-yellow-400">
            {currentStat.ties}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('playerCard.tiesShort')}</div>
        </div>
        <div>
          <div className="text-lg font-bold text-red-600 dark:text-red-400">
            {currentStat.losses}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('playerCard.lossesShort')}</div>
        </div>
        {currentStat.totalMatches > 0 && (
          <div className="ml-2 pl-4 border-l border-gray-300 dark:border-gray-600">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {((currentStat.wins / currentStat.totalMatches) * 100).toFixed(1)}% {t('playerCard.winsShort')}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {((currentStat.ties / currentStat.totalMatches) * 100).toFixed(1)}% {t('playerCard.tiesShort')}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {((currentStat.losses / currentStat.totalMatches) * 100).toFixed(1)}% {t('playerCard.lossesShort')}
            </div>
          </div>
        )}
      </div>
      <div className="text-right">
        <div className="text-2xl font-bold text-gray-900 dark:text-white">
          {currentStat.totalMatches}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">{t('playerCard.totalGames')}</div>
      </div>
    </div>
  );

  return (
    <div className="w-full">
      <div className={`flex items-center gap-2 bg-gray-100 ${darkBgClass} rounded-t-xl px-1.5 pt-1.5 pb-0 w-full`}>
        <button
          onClick={() => onTabChange('30')}
          className={`flex-1 px-3 py-1.5 rounded-lg font-medium text-xs transition-all duration-300 ease-in-out ${
            activeTab === '30'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          {t('playerCard.last30Days')}
        </button>
        <button
          onClick={() => onTabChange('90')}
          className={`flex-1 px-3 py-1.5 rounded-lg font-medium text-xs transition-all duration-300 ease-in-out ${
            activeTab === '90'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          {t('playerCard.last90Days')}
        </button>
        <button
          onClick={() => onTabChange('all')}
          className={`flex-1 px-3 py-1.5 rounded-lg font-medium text-xs transition-all duration-300 ease-in-out ${
            activeTab === 'all'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          {t('playerCard.allGames')}
        </button>
      </div>

      {onLevelClick ? (
        <button
          onClick={onLevelClick}
          className="w-full pt-4 bg-gray-100 dark:bg-gray-700/50 rounded-b-xl rounded-t-none px-4 pt-0 pb-4 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer"
        >
          {content}
        </button>
      ) : (
        <div className="w-full pt-4 bg-gray-100 dark:bg-gray-700/50 rounded-b-xl rounded-t-none px-4 pt-0 pb-4">
          {content}
        </div>
      )}
    </div>
  );
};

