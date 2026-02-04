import { useState } from 'react';
import { Button } from './Button';
import { AppVersionService } from '@/services/appVersion.service';
import { getCapacitorPlatform } from '@/utils/capacitor';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog';

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
  const [isOpen, setIsOpen] = useState(true);

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
      setIsOpen(false);
      setTimeout(() => {
        onClose();
      }, 300);
    }
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} modalId="app-version-modal">
      <DialogContent showCloseButton={!isBlocking} closeOnInteractOutside={!isBlocking}>
        <DialogHeader>
          <DialogTitle>{isBlocking ? 'Update Required' : 'Update Available'}</DialogTitle>
          {minVersion && (
            <DialogDescription>Version {minVersion} is now available</DialogDescription>
          )}
        </DialogHeader>

        <div className="mb-6">
          {message ? (
            <DialogDescription className="whitespace-pre-wrap">
              {message}
            </DialogDescription>
          ) : (
            <DialogDescription>
              {isBlocking
                ? 'This version is no longer supported. Please update to continue using the app.'
                : 'A new version of the app is available with new features and improvements.'}
            </DialogDescription>
          )}
        </div>

        <DialogFooter className="flex gap-3">
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
        </DialogFooter>

        {isBlocking && (
          <DialogDescription className="mt-4 text-xs text-center">
            You must update to continue using the app
          </DialogDescription>
        )}
      </DialogContent>
    </Dialog>
  );
};
