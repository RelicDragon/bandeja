import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Flag, X } from 'lucide-react';
import { ChatMessage } from '@/api/chat';
import { chatApi } from '@/api/chat';
import { toast } from 'react-hot-toast';

type MessageReportReason = 'SPAM' | 'HARASSMENT' | 'INAPPROPRIATE_CONTENT' | 'FAKE_INFORMATION' | 'OTHER';

interface ReportMessageModalProps {
  isOpen: boolean;
  message: ChatMessage | null;
  onClose: () => void;
}

export const ReportMessageModal: React.FC<ReportMessageModalProps> = ({
  isOpen,
  message,
  onClose
}) => {
  const { t } = useTranslation();
  const [selectedReason, setSelectedReason] = useState<MessageReportReason | null>(null);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      setSelectedReason(null);
      setDescription('');
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !message) return null;

  const reasons: { value: MessageReportReason; label: string }[] = [
    { value: 'SPAM', label: t('chat.report.reasons.SPAM') },
    { value: 'HARASSMENT', label: t('chat.report.reasons.HARASSMENT') },
    { value: 'INAPPROPRIATE_CONTENT', label: t('chat.report.reasons.INAPPROPRIATE_CONTENT') },
    { value: 'FAKE_INFORMATION', label: t('chat.report.reasons.FAKE_INFORMATION') },
    { value: 'OTHER', label: t('chat.report.reasons.OTHER') }
  ];

  const handleSubmit = async () => {
    if (!selectedReason) {
      toast.error(t('chat.report.selectReason'));
      return;
    }

    if (selectedReason === 'OTHER' && !description.trim()) {
      toast.error(t('chat.report.descriptionRequired'));
      return;
    }

    setIsSubmitting(true);
    try {
      await chatApi.reportMessage(message.id, {
        reason: selectedReason,
        description: selectedReason === 'OTHER' ? description.trim() : undefined
      });
      toast.success(t('chat.report.success'));
      onClose();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || t('chat.report.error');
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ pointerEvents: 'auto' }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            style={{ pointerEvents: 'auto' }}
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] flex flex-col"
            style={{ pointerEvents: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <Flag className="w-5 h-5 text-red-500" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {t('chat.report.title')}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                {t('chat.report.description')}
              </p>

              <div className="space-y-3 mb-6">
                {reasons.map((reason) => (
                  <button
                    key={reason.value}
                    onClick={() => {
                      setSelectedReason(reason.value);
                      if (reason.value !== 'OTHER') {
                        setDescription('');
                      }
                    }}
                    className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                      selectedReason === reason.value
                        ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {reason.label}
                    </span>
                  </button>
                ))}
              </div>

              {selectedReason === 'OTHER' && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('chat.report.descriptionLabel')}
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t('chat.report.descriptionPlaceholder')}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                    rows={4}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !selectedReason || (selectedReason === 'OTHER' && !description.trim())}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? t('common.loading') : t('chat.report.submit')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

