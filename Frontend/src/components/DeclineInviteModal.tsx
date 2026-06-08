import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';

interface DeclineInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDecline: (message?: string) => void | Promise<void>;
  isLoading?: boolean;
}

export const DeclineInviteModal = ({
  isOpen,
  onClose,
  onDecline,
  isLoading = false,
}: DeclineInviteModalProps) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setReason('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDecline = () => {
    const trimmed = reason.trim();
    void onDecline(trimmed || undefined);
  };

  return (
    <Dialog open={isOpen} onClose={onClose} modalId="decline-invite-modal">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('invites.declineModal.title')}</DialogTitle>
        </DialogHeader>

        <div className="p-6 overflow-y-auto flex-1">
          <DialogDescription className="mb-4">
            {t('invites.declineModal.description')}
          </DialogDescription>

          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('invites.declineModal.reasonLabel')}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('invites.declineModal.reasonPlaceholder')}
            maxLength={10000}
            disabled={isLoading}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none disabled:opacity-50"
            rows={4}
          />
        </div>

        <div className="flex items-center gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleDecline}
            disabled={isLoading}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? t('common.loading') : t('invites.declineModal.confirm')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
