import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components';
import { AlertTriangle } from 'lucide-react';
import { BaseModal } from './BaseModal';

interface ConfirmationModalProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'primary' | 'danger';
  highlightedText?: string;
  onConfirm: () => void;
  onClose: () => void;
  isOpen: boolean;
}

export const ConfirmationModal = ({
  title,
  message,
  confirmText,
  cancelText,
  confirmVariant = 'primary',
  highlightedText,
  onConfirm,
  onClose,
  isOpen
}: ConfirmationModalProps) => {
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

  const handleConfirm = () => {
    onConfirm();
    handleClose();
  };

  return (
    <BaseModal 
      isOpen={internalIsOpen} 
      onClose={handleClose} 
      isBasic 
      modalId="confirmation-modal"
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
            {title}
          </h3>

          <p className="text-gray-500 dark:text-gray-400 mb-6">
            {message}
          </p>
          {highlightedText && (
            <div className="mb-6">
              <span className="inline-block px-3 py-1 bg-red-100 dark:bg-red-900/30 rounded-full text-red-800 dark:text-red-200 font-medium text-sm">
                {highlightedText}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <Button
            onClick={handleClose}
            variant="outline"
            className="flex-1"
          >
            {cancelText || t('common.cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            variant={confirmVariant}
            className="flex-1"
          >
            {confirmText || t('common.confirm')}
          </Button>
        </div>
    </BaseModal>
  );
};
