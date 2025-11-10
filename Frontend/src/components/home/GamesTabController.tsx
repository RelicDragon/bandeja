import { useTranslation } from 'react-i18next';

interface GamesTabControllerProps {
  activeTab: 'my-games' | 'past-games';
  onTabChange: (tab: 'my-games' | 'past-games') => void;
}

export const GamesTabController = ({ activeTab, onTabChange }: GamesTabControllerProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2 mb-4 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
      <button
        onClick={() => onTabChange('my-games')}
        className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ease-in-out ${
          activeTab === 'my-games'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        {t('home.myGames')}
      </button>
      <button
        onClick={() => onTabChange('past-games')}
        className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ease-in-out ${
          activeTab === 'past-games'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        {t('home.pastGames')}
      </button>
    </div>
  );
};

