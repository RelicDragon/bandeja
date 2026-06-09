import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';

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

  const handleDecline = () => {
    const trimmed = reason.trim();
    void onDecline(trimmed || undefined);
  };

  const handleClose = () => {
    if (!isLoading) onClose();
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} modalId="decline-invite-modal">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('invites.declineModal.title')}</DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-4 space-y-4 overflow-y-auto flex-1 min-h-0">
          <DialogDescription>{t('invites.declineModal.description')}</DialogDescription>

          <div>
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
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-3">
          <Button onClick={handleClose} variant="outline" className="flex-1" disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleDecline} variant="danger" className="flex-1" disabled={isLoading}>
            {isLoading ? t('common.loading') : t('invites.declineModal.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
