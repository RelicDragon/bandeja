import { useTranslation } from 'react-i18next';
import { useNavigationStore } from '@/store/navigationStore';
import { useHeaderStore } from '@/store/headerStore';

export const MyGamesTabController = () => {
  const { t } = useTranslation();
  const { activeTab, setActiveTab } = useNavigationStore();
  const { myGamesUnreadCount, pastGamesUnreadCount } = useHeaderStore();

  return (
    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
      <button
        onClick={() => setActiveTab('my-games')}
        className={`relative px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
          activeTab === 'my-games'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        {t('home.myGames')}
        {myGamesUnreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-medium">
            {myGamesUnreadCount > 99 ? '99+' : myGamesUnreadCount}
          </span>
        )}
      </button>
      <button
        onClick={() => setActiveTab('past-games')}
        className={`relative px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
          activeTab === 'past-games'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        {t('home.past')}
        {pastGamesUnreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-medium">
            {pastGamesUnreadCount > 99 ? '99+' : pastGamesUnreadCount}
          </span>
        )}
      </button>
    </div>
  );
};
