import { useEffect, useState } from 'react';
import { useNetworkStore } from '@/utils/networkStatus';
import { WifiOff, Loader2 } from 'lucide-react';

interface AppLoadingScreenProps {
  isInitializing: boolean;
}

export const AppLoadingScreen = ({ isInitializing }: AppLoadingScreenProps) => {
  const isOnline = useNetworkStore((state) => state.isOnline);
  const [showOfflineWarning, setShowOfflineWarning] = useState(false);

  useEffect(() => {
    if (!isOnline && isInitializing) {
      const timer = setTimeout(() => {
        setShowOfflineWarning(true);
      }, 2000);
      return () => clearTimeout(timer);
    } else {
      setShowOfflineWarning(false);
    }
  }, [isOnline, isInitializing]);

  if (!isInitializing) return null;

  return (
    <div className="fixed inset-0 bg-gray-50 dark:bg-gray-900 flex items-center justify-center z-50">
      <div className="flex flex-col items-center gap-4 px-6">
        {isOnline ? (
          <>
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
            <p className="text-gray-600 dark:text-gray-400 text-center">
              Loading...
            </p>
          </>
        ) : (
          <>
            <WifiOff className="w-16 h-16 text-yellow-600" />
            <div className="text-center">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                No Internet Connection
              </h2>
              {showOfflineWarning && (
                <p className="text-gray-600 dark:text-gray-400 max-w-sm">
                  The app is starting in offline mode. Some features may be limited until you're back online.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

