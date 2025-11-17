import { useTranslation } from 'react-i18next';

interface GamesStatsTabControllerProps {
  activeTab: '30' | '90' | 'all';
  onTabChange: (tab: '30' | '90' | 'all') => void;
  darkBgClass?: string;
}

export const GamesStatsTabController = ({ activeTab, onTabChange, darkBgClass = 'dark:bg-gray-800' }: GamesStatsTabControllerProps) => {
  const { t } = useTranslation();

  return (
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
  );
};

