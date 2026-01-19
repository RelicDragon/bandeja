import { useTranslation } from 'react-i18next';
import { Button } from '@/components';
import { AlertTriangle } from 'lucide-react';
import { BaseModal } from './BaseModal';

interface DeleteGameConfirmationModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onClose: () => void;
  isDeleting?: boolean;
}

export const DeleteGameConfirmationModal = ({
  isOpen,
  onConfirm,
  onClose,
  isDeleting = false
}: DeleteGameConfirmationModalProps) => {
  const { t } = useTranslation();

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <BaseModal 
      isOpen={isOpen} 
      onClose={onClose} 
      isBasic 
      modalId="delete-game-confirmation-modal"
      showCloseButton={true}
      closeOnBackdropClick={true}
    >
        <div className="flex flex-col text-center">
          <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle
              size={24}
              className="text-orange-600 dark:text-orange-400"
            />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {t('gameDetails.deleteGame')}
          </h3>

          <p className="text-gray-500 dark:text-gray-400 mb-6">
            {t('gameDetails.deleteGameConfirmation')}
          </p>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1"
            disabled={isDeleting}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            variant="danger"
            className="flex-1"
            disabled={isDeleting}
          >
            {isDeleting ? t('common.deleting') || 'Deleting...' : t('common.delete')}
          </Button>
        </div>
    </BaseModal>
  );
};

