import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components';
import { X, AlertTriangle, Upload, Download } from 'lucide-react';

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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="modal-container"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            key="modal-content"
            initial={{ scale: 0.95, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 30, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 max-w-md w-full border border-gray-200 dark:border-gray-700 z-10"
            onClick={(e) => e.stopPropagation()}
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

            <button
              onClick={onClose}
              disabled={isSyncing || isLoading}
              className="absolute top-3 right-3 p-2 rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X size={20} />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

