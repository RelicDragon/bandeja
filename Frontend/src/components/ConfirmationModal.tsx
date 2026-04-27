import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components';
import { AlertTriangle, ImageOff } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog';

interface ConfirmationModalProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'primary' | 'danger';
  /** warning: caution (default). info: neutral emphasis for reversible / informational checks. */
  tone?: 'warning' | 'info';
  highlightedText?: string;
  isLoading?: boolean;
  loadingText?: string;
  closeOnConfirm?: boolean;
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
  tone = 'warning',
  highlightedText,
  isLoading = false,
  loadingText,
  closeOnConfirm = true,
  onConfirm,
  onClose,
  isOpen
}: ConfirmationModalProps) => {
  const { t } = useTranslation();
  const [internalIsOpen, setInternalIsOpen] = useState(isOpen);

  useEffect(() => {
    setInternalIsOpen(isOpen);
  }, [isOpen]);

  const handleClose = () => {
    setInternalIsOpen(false);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const handleConfirm = () => {
    onConfirm();
    if (closeOnConfirm) handleClose();
  };

  return (
    <Dialog open={internalIsOpen} onClose={handleClose} modalId="confirmation-modal">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mt-4 ${
            tone === 'info'
              ? 'bg-sky-100 dark:bg-sky-950/40'
              : 'bg-orange-100 dark:bg-orange-900/20'
          }`}
        >
          {tone === 'info' ? (
            <ImageOff size={24} className="text-sky-600 dark:text-sky-400" aria-hidden />
          ) : (
            <AlertTriangle size={24} className="text-orange-600 dark:text-orange-400" aria-hidden />
          )}
        </div>
        
        <DialogDescription className="p-4">
          {message}
        </DialogDescription>
        {highlightedText && (
          <div className="mb-6">
            <span className="inline-block px-3 py-1 bg-red-100 dark:bg-red-900/30 rounded-full text-red-800 dark:text-red-200 font-medium text-sm">
              {highlightedText}
            </span>
          </div>
        )}

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-3 mt-4">
          <Button
            onClick={handleClose}
            variant="outline"
            className="flex-1"
            disabled={isLoading}
          >
            {cancelText || t('common.cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            variant={confirmVariant}
            className="flex-1"
            disabled={isLoading}
          >
            {isLoading ? (loadingText || t('common.deleting')) : (confirmText || t('common.confirm'))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
