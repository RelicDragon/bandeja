import { useTranslation } from 'react-i18next';

interface ComparisonTabControllerProps {
  activeTab: 'stats' | 'games' | 'more';
  onTabChange: (tab: 'stats' | 'games' | 'more') => void;
}

export const ComparisonTabController = ({ activeTab, onTabChange }: ComparisonTabControllerProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2 mb-4 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
      <button
        onClick={() => onTabChange('stats')}
        className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ease-in-out ${
          activeTab === 'stats'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        {t('profile.matches') || 'Matches'}
      </button>
      <button
        onClick={() => onTabChange('games')}
        className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ease-in-out ${
          activeTab === 'games'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        {t('profile.games') || 'Games'}
      </button>
      <button
        onClick={() => onTabChange('more')}
        className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ease-in-out ${
          activeTab === 'more'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        {t('profile.more') || 'More'}
      </button>
    </div>
  );
};

