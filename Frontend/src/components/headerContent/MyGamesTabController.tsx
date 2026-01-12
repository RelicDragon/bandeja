import { useTranslation } from 'react-i18next';
import { useNavigationStore } from '@/store/navigationStore';

export const MyGamesTabController = () => {
  const { t } = useTranslation();
  const { activeTab, setActiveTab } = useNavigationStore();

  return (
    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
      <button
        onClick={() => setActiveTab('my-games')}
        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
          activeTab === 'my-games'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        {t('home.myGames')}
      </button>
      <button
        onClick={() => setActiveTab('past-games')}
        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
          activeTab === 'past-games'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        {t('home.past')}
      </button>
    </div>
  );
};
