import { useTranslation } from 'react-i18next';
import { useNavigationStore } from '@/store/navigationStore';
import { User as UserIcon } from 'lucide-react';

export const ProfileTabController = () => {
  const { t } = useTranslation();
  const { profileActiveTab, setProfileActiveTab } = useNavigationStore();

  return (
    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
      <button
        onClick={() => setProfileActiveTab('general')}
        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-1 ${
          profileActiveTab === 'general'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        <UserIcon size={16} />
      </button>
      <button
        onClick={() => setProfileActiveTab('statistics')}
        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
          profileActiveTab === 'statistics'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        {t('profile.statistics') || 'Statistics'}
      </button>
      <button
        onClick={() => setProfileActiveTab('comparison')}
        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
          profileActiveTab === 'comparison'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        {t('profile.comparison') || 'Comparison'}
      </button>
    </div>
  );
};
