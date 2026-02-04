import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Settings } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog';
import { Button } from './Button';
import { openAppSettings } from '@/utils/settings';

interface PermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  permissionType: 'photos' | 'camera';
  onOpenSettings?: () => void;
}

export const PermissionModal = ({
  isOpen,
  onClose,
  permissionType,
  onOpenSettings,
}: PermissionModalProps) => {
  const { t } = useTranslation();
  const [internalIsOpen, setInternalIsOpen] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setInternalIsOpen(true);
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setInternalIsOpen(false);
    setTimeout(() => {
      onClose();
    }, 300);
  }, [onClose]);

  const handleOpenSettings = useCallback(async () => {
    if (onOpenSettings) {
      onOpenSettings();
    } else {
      await openAppSettings();
    }
    handleClose();
  }, [onOpenSettings, handleClose]);

  const translations = useMemo(() => {
    const permissionKey = permissionType === 'photos' ? 'photos' : 'camera';
    return {
      title: t(`permissions.${permissionKey}.title`),
      description: t(`permissions.${permissionKey}.description`),
      denied: t(`permissions.${permissionKey}.denied`),
      openSettings: t('permissions.openSettings'),
      cancel: t('common.cancel'),
    };
  }, [permissionType, t]);

  return (
    <Dialog open={internalIsOpen} onClose={handleClose} modalId="permission-modal">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{translations.title}</DialogTitle>
        </DialogHeader>
      <div className="flex flex-col text-center">
        <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-4">
          <Camera
            size={32}
            className="text-blue-600 dark:text-blue-400"
          />
        </div>
        <DialogDescription className="mb-4">
          {translations.description}
        </DialogDescription>
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Settings size={20} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-200 text-left">
              {translations.denied}
            </p>
          </div>
        </div>
      </div>

      <DialogFooter className="flex flex-col-reverse sm:flex-row gap-3">
        <Button
          onClick={handleClose}
          variant="outline"
          className="flex-1"
        >
          {translations.cancel}
        </Button>
        <Button
          onClick={handleOpenSettings}
          variant="primary"
          className="flex-1"
        >
          {translations.openSettings}
        </Button>
      </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
