import { ArrowLeft } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { handleBackNavigation } from '@/utils/navigation';
import { useNavigationStore } from '@/store/navigationStore';

export const GameDetailsHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { setCurrentPage } = useNavigationStore();

  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => {
            handleBackNavigation({
              pathname: location.pathname,
              locationState: location.state as { fromLeagueSeasonGameId?: string } | null,
              navigate,
              setCurrentPage,
            });
          }}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
          {t('games.details')}
        </h1>
      </div>
    </div>
  );
};
