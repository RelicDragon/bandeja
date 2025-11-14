import { useTranslation } from 'react-i18next';

interface LevelHistoryTabControllerProps {
  activeTab: '10' | '30' | 'all';
  onTabChange: (tab: '10' | '30' | 'all') => void;
  darkBgClass?: string;
}

export const LevelHistoryTabController = ({ activeTab, onTabChange, darkBgClass = 'dark:bg-gray-800' }: LevelHistoryTabControllerProps) => {
  const { t } = useTranslation();

  return (
    <div className={`flex items-center gap-2 mb-4 bg-gray-100 ${darkBgClass} rounded-xl p-1.5 w-full`}>
      <button
        onClick={() => onTabChange('10')}
        className={`flex-1 px-3 py-1.5 rounded-lg font-medium text-xs transition-all duration-300 ease-in-out ${
          activeTab === '10'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        {t('playerCard.last10Events')}
      </button>
      <button
        onClick={() => onTabChange('30')}
        className={`flex-1 px-3 py-1.5 rounded-lg font-medium text-xs transition-all duration-300 ease-in-out ${
          activeTab === '30'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        {t('playerCard.last30Events')}
      </button>
      <button
        onClick={() => onTabChange('all')}
        className={`flex-1 px-3 py-1.5 rounded-lg font-medium text-xs transition-all duration-300 ease-in-out ${
          activeTab === 'all'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        {t('playerCard.allEvents')}
      </button>
    </div>
  );
};

