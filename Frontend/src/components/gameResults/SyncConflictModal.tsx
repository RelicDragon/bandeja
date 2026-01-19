import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components';
import { AlertTriangle, Upload, Download } from 'lucide-react';
import { BaseModal } from '../BaseModal';

interface SyncConflictModalProps {
  isOpen: boolean;
  onSyncToServer: () => void;
  onLoadFromServer: () => void;
  onClose: () => void;
  isSyncing?: boolean;
  isLoading?: boolean;
}

export const SyncConflictModal = ({
  isOpen,
  onSyncToServer,
  onLoadFromServer,
  onClose,
  isSyncing = false,
  isLoading = false,
}: SyncConflictModalProps) => {
  const { t } = useTranslation();
  const [internalIsOpen, setInternalIsOpen] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setInternalIsOpen(true);
    }
  }, [isOpen]);

  const handleClose = () => {
    setInternalIsOpen(false);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  return (
    <BaseModal 
      isOpen={internalIsOpen} 
      onClose={handleClose} 
      isBasic 
      modalId="sync-conflict-modal"
      showCloseButton={true}
      closeOnBackdropClick={true}
    >
        <div className="flex flex-col text-center">
          <div className="w-12 h-12 rounded-full bg-yellow-100 dark:bg-yellow-900/20 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle
              size={24}
              className="text-yellow-600 dark:text-yellow-400"
            />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {t('gameResults.unsyncedChangesTitle') || 'Unsynced Changes Detected'}
          </h3>

          <p className="text-gray-500 dark:text-gray-400 mb-6">
            {t('gameResults.unsyncedChangesMessage') || 'You have local changes that are not synced to the server. Before updating the local database, please choose an action:'}
          </p>
        </div>

        <div className="flex flex-col gap-3 mb-4">
          <Button
            onClick={onSyncToServer}
            disabled={isSyncing || isLoading}
            variant="primary"
            className="w-full flex items-center justify-center gap-2"
          >
            <Upload size={18} />
            {isSyncing ? (t('common.loading') || 'Syncing...') : (t('gameResults.syncToServerFirst') || 'Sync to Server First')}
          </Button>
          <Button
            onClick={onLoadFromServer}
            disabled={isSyncing || isLoading}
            variant="outline"
            className="w-full flex items-center justify-center gap-2"
          >
            <Download size={18} />
            {isLoading ? (t('common.loading') || 'Loading...') : (t('gameResults.eraseAndLoadFromServer') || 'Erase Local Changes & Load from Server')}
          </Button>
        </div>
    </BaseModal>
  );
};

