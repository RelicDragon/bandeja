import { useTranslation } from 'react-i18next';
import { TabType } from '@/hooks/useGameResultsTabs';

interface GameResultsTabsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  resultsStatus?: string;
}

export const GameResultsTabs = ({ activeTab, onTabChange, resultsStatus }: GameResultsTabsProps) => {
  const { t } = useTranslation();
  const isFinal = resultsStatus === 'FINAL';

  if (!isFinal) {
    return (
      <div className="flex justify-center space-x-1 py-2 px-4">
        <button
          onClick={() => onTabChange('scores')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'scores'
              ? 'bg-blue-500 text-white'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          {t('gameResults.scores')}
        </button>
        <button
          onClick={() => onTabChange('stats')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'stats'
              ? 'bg-blue-500 text-white'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          {t('gameResults.stats') || 'Stats'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex justify-center space-x-1 py-2 px-4">
      <button
        onClick={() => onTabChange('results')}
        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
          activeTab === 'results'
            ? 'bg-blue-500 text-white'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
      >
        {t('gameResults.results')}
      </button>
      <button
        onClick={() => onTabChange('stats')}
        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
          activeTab === 'stats'
            ? 'bg-blue-500 text-white'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
      >
        {t('gameResults.stats') || 'Stats'}
      </button>
      <button
        onClick={() => onTabChange('scores')}
        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
          activeTab === 'scores'
            ? 'bg-blue-500 text-white'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
      >
        {t('gameResults.scores')}
      </button>
    </div>
  );
};

