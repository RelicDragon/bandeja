import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';

interface GamesTabControllerProps {
  activeTab: 'my-games' | 'past-games' | 'search';
  onTabChange: (tab: 'my-games' | 'past-games' | 'search') => void;
}

export const GamesTabController = ({ activeTab, onTabChange }: GamesTabControllerProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
      <button
        onClick={() => onTabChange('my-games')}
        className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ease-in-out ${
          activeTab === 'my-games'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        <span className="min-[400px]:hidden">{t('home.myGamesShort')}</span>
        <span className="hidden min-[400px]:inline">{t('home.myGames')}</span>
      </button>
      <button
        onClick={() => onTabChange('past-games')}
        className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ease-in-out ${
          activeTab === 'past-games'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        {t('home.past')}
      </button>
      <button
        onClick={() => onTabChange('search')}
        className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ease-in-out flex items-center justify-center gap-1.5 ${
          activeTab === 'search'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        <Search size={16} />
        {t('home.search')}
      </button>
    </div>
  );
};
