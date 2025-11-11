import { useNetworkStore } from '@/utils/networkStatus';
import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const OfflineBanner = () => {
  const { t } = useTranslation();
  const isOnline = useNetworkStore((state) => state.isOnline);

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 dark:bg-yellow-600 text-white px-4 py-2 flex items-center justify-center gap-2 shadow-lg">
      <WifiOff className="w-5 h-5" />
      <span className="text-sm font-medium">
        {t('offline.working_offline')}
      </span>
    </div>
  );
};

