import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';
import { AppVersionService } from '@/services/appVersion.service';
import { getCapacitorPlatform } from '@/utils/capacitor';

interface AppVersionModalProps {
  isBlocking: boolean;
  minVersion?: string;
  message?: string;
  onClose?: () => void;
}

export const AppVersionModal = ({ 
  isBlocking, 
  minVersion, 
  message,
  onClose 
}: AppVersionModalProps) => {
  useEffect(() => {
    if (isBlocking) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isBlocking]);

  const handleUpdate = () => {
    const platform = getCapacitorPlatform();
    if (platform) {
      const storeUrl = AppVersionService.getStoreUrl(platform);
      if (storeUrl) {
        window.open(storeUrl, '_blank');
      }
    }
  };

  const handleClose = () => {
    if (!isBlocking && onClose) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[9999]"
      onClick={handleClose}
    >
      <div 
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {!isBlocking && (
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        )}

        <div className="mb-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {isBlocking ? 'Update Required' : 'Update Available'}
          </h2>
          {minVersion && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Version {minVersion} is now available
            </p>
          )}
        </div>

        <div className="mb-6">
          {message ? (
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {message}
            </p>
          ) : (
            <p className="text-gray-700 dark:text-gray-300">
              {isBlocking
                ? 'This version is no longer supported. Please update to continue using the app.'
                : 'A new version of the app is available with new features and improvements.'}
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <Button
            onClick={handleUpdate}
            variant="primary"
            className="flex-1"
          >
            Update Now
          </Button>
          {!isBlocking && (
            <Button
              onClick={handleClose}
              variant="secondary"
              className="flex-1"
            >
              Later
            </Button>
          )}
        </div>

        {isBlocking && (
          <p className="mt-4 text-xs text-center text-gray-500 dark:text-gray-400">
            You must update to continue using the app
          </p>
        )}
      </div>
    </div>
  );
};
