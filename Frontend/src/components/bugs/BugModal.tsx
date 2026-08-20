import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { Button, Select } from '@/components';
import { BugType, BugPriority } from '@/types';
import { BugPrioritySelector } from '@/components/chat/BugPrioritySelector';
import { bugsApi } from '@/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog';
import { BugCreateError } from './BugCreateError';
import { extractBugCreateErrorMessage } from './bugCreateErrorMessage';
import { getBugCreatePlatformInfo } from './bugCreatePlatformInfo';

const BUG_TYPE_VALUES: BugType[] = ['BUG', 'CRITICAL', 'SUGGESTION', 'QUESTION', 'TASK'];

interface BugModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (groupChannelId?: string) => void;
}

export const BugModal = ({ isOpen, onClose, onSuccess }: BugModalProps) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [bugType, setBugType] = useState<BugType>('BUG');
  const [priority, setPriority] = useState<BugPriority>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submitGenerationRef = useRef(0);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!text.trim()) {
      toast.error(t('bug.textRequired'));
      return;
    }

    const submitGeneration = ++submitGenerationRef.current;
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const platformInfo = await getBugCreatePlatformInfo();
      const bugText = `${text.trim()}\n${platformInfo}`;
      const res = await bugsApi.createBug({ text: bugText, bugType, priority });
      if (submitGeneration !== submitGenerationRef.current) return;
      toast.success(t('bug.created'));
      setText('');
      setBugType('BUG');
      setPriority(0);
      setSubmitError(null);
      const groupChannelId = res.data?.groupChannel?.id;
      onSuccess(groupChannelId);
    } catch (error: unknown) {
      if (submitGeneration !== submitGenerationRef.current) return;
      const errorMessage = extractBugCreateErrorMessage(error);
      setSubmitError(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      if (submitGeneration === submitGenerationRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  const handleClose = () => {
    submitGenerationRef.current += 1;
    setText('');
    setBugType('BUG');
    setPriority(0);
    setSubmitError(null);
    setIsSubmitting(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} modalId="bug-modal">
      <DialogContent ignoreOutsideClickSelector="[data-select-dropdown]">
        <DialogHeader>
          <DialogTitle>{t('bug.addBug')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                {t('bug.type')}
              </label>
              <Select
                options={BUG_TYPE_VALUES.map((type) => ({
                  value: type,
                  label: t(`bug.types.${type}`)
                }))}
                value={bugType}
                onChange={(value) => setBugType(value as BugType)}
              />
            </div>

            <div className="mb-4">
              <BugPrioritySelector
                currentPriority={priority}
                onPriorityChange={setPriority}
                disabled={isSubmitting}
              />
            </div>

            <div>
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
          </div>

          <div className="sticky bottom-0 z-10 shrink-0 bg-white dark:bg-gray-900">
            <BugCreateError message={submitError} />

            <DialogFooter className="flex gap-3">
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
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
