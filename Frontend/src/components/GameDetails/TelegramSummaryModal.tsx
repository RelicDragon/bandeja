import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog';
import { gamesApi } from '@/api/games';

interface TelegramSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameId: string;
  initialSummary: string;
  onSend: (summaryText: string) => Promise<void>;
}

export const TelegramSummaryModal = ({
  isOpen,
  onClose,
  gameId,
  initialSummary,
  onSend,
}: TelegramSummaryModalProps) => {
  const { t } = useTranslation();
  const [summary, setSummary] = useState(initialSummary);
  const [isGeneratingNew, setIsGeneratingNew] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevIsOpenRef = useRef(false);

  useEffect(() => {
    const wasClosed = !prevIsOpenRef.current && isOpen;
    prevIsOpenRef.current = isOpen;
    
    if (wasClosed) {
      setSummary(initialSummary);
      setIsGeneratingNew(false);
      setIsSending(false);
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 250);
    }
  }, [isOpen, initialSummary]);

  const handleGenerateNew = async () => {
    if (isGeneratingNew || isSending || !gameId) return;

    setIsGeneratingNew(true);
    try {
      const response = await gamesApi.prepareTelegramSummary(gameId);
      if (response.data?.summary) {
        setSummary(response.data.summary);
        textareaRef.current?.focus();
      } else {
        throw new Error('Summary not received from server');
      }
    } catch (error: any) {
      console.error('Failed to generate new summary:', error);
      const errorMessage = error?.response?.data?.message || error?.message || 
        t('gameResults.generateTextFailed') || 'Failed to generate new text';
      toast.error(errorMessage);
    } finally {
      setIsGeneratingNew(false);
    }
  };

  const handleSend = async () => {
    if (isSending || isGeneratingNew) return;
    if (!summary.trim()) {
      toast.error(t('gameResults.textRequired') || 'Text cannot be empty');
      return;
    }

    setIsSending(true);
    try {
      await onSend(summary.trim());
      toast.success(t('gameResults.resultsSentToTelegram') || 'Results sent to Telegram successfully');
      onClose();
    } catch (error: any) {
      console.error('Failed to send results to Telegram:', error);
      const errorMessage = error?.response?.data?.message || error?.message || 
        t('gameResults.sendToTelegramFailed') || 'Failed to send results to Telegram';
      toast.error(errorMessage);
    } finally {
      setIsSending(false);
    }
  };

  const handleCancel = () => {
    if (isSending || isGeneratingNew) return;
    onClose();
  };

  const isLoading = isGeneratingNew || isSending;
  const isDisabled = isLoading;

  return (
    <Dialog open={isOpen} onClose={handleCancel} modalId="telegram-summary-modal">
      <DialogContent>
      <div className="flex flex-col h-full max-h-[85vh]">
        <DialogHeader className="mb-4 flex-col items-start">
          <DialogTitle>{t('gameResults.editTelegramText') || 'Edit Telegram Text'}</DialogTitle>
          <DialogDescription className="mt-1">
            {t('gameResults.editTelegramTextDescription') || 'Review and edit the text before sending to Telegram'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0 mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('gameResults.text') || 'Text'}
            </label>
            <button
              type="button"
              onClick={handleGenerateNew}
              disabled={isDisabled || !gameId}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 ease-in-out rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20"
            >
              <RefreshCw 
                size={16} 
                className={isGeneratingNew ? 'animate-spin' : ''}
              />
              <span>{t('gameResults.writeNewVersion') || 'Write new version'}</span>
            </button>
          </div>

          <div className="flex-1 relative min-h-[300px]">
            <textarea
              ref={textareaRef}
              value={summary}
              onChange={(e) => !isDisabled && setSummary(e.target.value)}
              disabled={isDisabled}
              placeholder={t('gameResults.textPlaceholder') || 'Enter text...'}
              className="w-full h-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 ease-in-out"
              style={{ minHeight: '300px' }}
            />
            {isSending && (
              <div className="absolute inset-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg flex items-center justify-center z-10 animate-fadeIn">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('gameResults.sendingToTelegram') || 'Sending to Telegram...'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isDisabled}
            className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 ease-in-out"
          >
            {t('common.cancel') || 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={isDisabled || !summary.trim()}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 ease-in-out shadow-sm hover:shadow-md"
          >
            {isSending ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>{t('gameResults.sending') || 'Sending...'}</span>
              </>
            ) : (
              <>
                <Send size={16} />
                <span>{t('gameResults.send') || 'Send'}</span>
              </>
            )}
          </button>
        </DialogFooter>
      </div>
      </DialogContent>
    </Dialog>
  );
};
