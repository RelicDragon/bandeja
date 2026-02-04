import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components';
import { AlertTriangle, Upload, Download } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog';

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
    <Dialog open={internalIsOpen} onClose={handleClose} modalId="sync-conflict-modal">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('gameResults.unsyncedChangesTitle') || 'Unsynced Changes Detected'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col text-center">
          <div className="w-12 h-12 rounded-full bg-yellow-100 dark:bg-yellow-900/20 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle
              size={24}
              className="text-yellow-600 dark:text-yellow-400"
            />
          </div>
          <DialogDescription className="mb-6">
            {t('gameResults.unsyncedChangesMessage') || 'You have local changes that are not synced to the server. Before updating the local database, please choose an action:'}
          </DialogDescription>
        </div>

        <DialogFooter className="flex flex-col gap-3 mb-4">
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

