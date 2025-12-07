import { WifiOff, AlertCircle } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface OfflineBannerProps {
  serverProblem: boolean;
  showMessage: boolean;
  onToggle: () => void;
  onSync: () => void;
  isSyncing: boolean;
}

export const OfflineBanner = ({
  serverProblem,
  showMessage,
  onToggle,
  onSync,
  isSyncing,
}: OfflineBannerProps) => {
  const { t } = useTranslation();

  if (!serverProblem) return null;

  return (
    <div className={`p-4 rounded-lg border ${
      serverProblem 
        ? 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700' 
        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
    }`}>
      <div 
        className="w-full flex items-center justify-center gap-2 cursor-pointer mb-2"
        onClick={onToggle}
      >
        <WifiOff size={20} className="text-yellow-800 dark:text-yellow-200" />
        <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
          {t('offline.noInternetConnection')}
        </span>
      </div>
      <AnimatePresence>
        {showMessage && (
          <div className="text-xs text-yellow-700 dark:text-yellow-300 text-center mb-2">
            {t('offline.offlineEditingMessage')}
          </div>
        )}
      </AnimatePresence>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onSync();
        }}
        disabled={isSyncing}
        className="w-full px-4 py-2 text-sm rounded-lg font-medium transition-colors bg-yellow-500 hover:bg-yellow-600 text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-lg flex items-center justify-center gap-2"
      >
        <AlertCircle size={16} />
        {isSyncing ? t('common.loading') : (t('gameResults.syncToServer') || 'Sync to Server')}
      </button>
    </div>
  );
};

