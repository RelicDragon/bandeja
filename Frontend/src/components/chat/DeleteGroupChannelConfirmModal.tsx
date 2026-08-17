import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';

interface DeleteGroupChannelConfirmModalProps {
  isOpen: boolean;
  groupName: string;
  isLoading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteGroupChannelConfirmModal({
  isOpen,
  groupName,
  isLoading = false,
  onClose,
  onConfirm,
}: DeleteGroupChannelConfirmModalProps) {
  const { t } = useTranslation();
  const [typedName, setTypedName] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setTypedName('');
    }
  }, [isOpen]);

  const nameMatches = typedName.trim() === groupName.trim();

  return (
    <Dialog open={isOpen} onClose={onClose} modalId="delete-group-channel-modal">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('chat.deleteGroupTitle')}</DialogTitle>
        </DialogHeader>
        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mt-4 bg-orange-100 dark:bg-orange-900/20">
          <AlertTriangle size={24} className="text-orange-600 dark:text-orange-400" aria-hidden />
        </div>
        <DialogDescription className="p-4 space-y-3">
          <p>{t('chat.deleteGroupMessage')}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('chat.deleteGroupTypePrompt')}
          </p>
        </DialogDescription>
        <div className="px-4 pb-2">
          <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400 truncate" title={groupName}>
            {groupName}
          </p>
          <input
            type="text"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            disabled={isLoading}
            autoComplete="off"
            spellCheck={false}
            placeholder={t('chat.deleteGroupNamePlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-3 mt-4">
          <Button onClick={onClose} variant="outline" className="flex-1" disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={onConfirm}
            variant="danger"
            className="flex-1"
            disabled={isLoading || !nameMatches}
          >
            {isLoading ? t('common.deleting') : t('chat.deleteGroupConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
