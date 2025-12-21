import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { Button } from '@/components';
import { BugType } from '@/types';

const BUG_TYPE_VALUES: BugType[] = ['BUG', 'CRITICAL', 'SUGGESTION', 'QUESTION'];
import { bugsApi } from '@/api';
import { toast } from 'react-hot-toast';
import { X } from 'lucide-react';

interface BugModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const BugModal = ({ isOpen, onClose, onSuccess }: BugModalProps) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [bugType, setBugType] = useState<BugType>('BUG');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!text.trim()) {
      toast.error(t('bug.textRequired'));
      return;
    }

    setIsSubmitting(true);
    try {
      await bugsApi.createBug({ text: text.trim(), bugType });
      toast.success(t('bug.created'));
      setText('');
      setBugType('BUG');
      onSuccess();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'bug.createError';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setText('');
    setBugType('BUG');
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
         onClick={onClose}
         style={{
           backgroundColor: 'rgba(0, 0, 0, 0.6)',
           backdropFilter: 'blur(4px)',
           WebkitBackdropFilter: 'blur(4px)',
           position: 'fixed',
           top: 0,
           left: 0,
           right: 0,
           bottom: 0,
         }}>
      <div className="bg-white dark:bg-gray-900 rounded-lg p-6 w-full max-w-md mx-4"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('bug.addBug')}</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="p-1"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              {t('bug.type')}
            </label>
            <select
              value={bugType}
              onChange={(e) => setBugType(e.target.value as BugType)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {BUG_TYPE_VALUES.map((type) => (
                <option key={type} value={type}>
                  {t(`bug.types.${type}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              {t('bug.description')}
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('bug.descriptionPlaceholder')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={4}
              maxLength={1000}
            />
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {text.length}/1000
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1"
              disabled={isSubmitting}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={isSubmitting || !text.trim()}
            >
              {isSubmitting ? t('common.submitting') : t('bug.submit')}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
