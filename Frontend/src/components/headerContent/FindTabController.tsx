import { useTranslation } from 'react-i18next';
import { useNavigationStore } from '@/store/navigationStore';

export const FindTabController = () => {
  const { t } = useTranslation();
  const { findViewMode, setFindViewMode } = useNavigationStore();

  return (
    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
      <button
        onClick={() => setFindViewMode('calendar')}
        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
          findViewMode === 'calendar'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        {t('games.calendar') || 'Calendar'}
      </button>
      <button
        onClick={() => setFindViewMode('list')}
        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
          findViewMode === 'list'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        {t('games.list') || 'List'}
      </button>
    </div>
  );
};
