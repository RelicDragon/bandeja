import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Select } from '@/components';
import { BugType } from '@/types';

const BUG_TYPE_VALUES: BugType[] = ['BUG', 'CRITICAL', 'SUGGESTION', 'QUESTION', 'TASK'];
import { bugsApi } from '@/api';
import { toast } from 'react-hot-toast';
import { isCapacitor, isIOS, isAndroid, getAppInfo, getCapacitorPlatform } from '@/utils/capacitor';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog';

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

  const getPlatformInfo = async (): Promise<string> => {
    if (!isCapacitor()) {
      return 'web-app';
    }

    try {
      const appInfo = await getAppInfo();
      if (!appInfo) {
        const platform = isIOS() ? 'iOS' : isAndroid() ? 'Android' : getCapacitorPlatform() || 'app';
        return `${platform} (unknown)`;
      }

      const platform = isIOS() ? 'iOS' : isAndroid() ? 'Android' : appInfo.platform;
      return `${platform} ${appInfo.version} (${appInfo.buildNumber})`;
    } catch (error) {
      const platform = isIOS() ? 'iOS' : isAndroid() ? 'Android' : getCapacitorPlatform() || 'app';
      return `${platform} (unknown)`;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!text.trim()) {
      toast.error(t('bug.textRequired'));
      return;
    }

    setIsSubmitting(true);
    try {
      const platformInfo = await getPlatformInfo();
      const bugText = `${text.trim()}\n${platformInfo}`;
      await bugsApi.createBug({ text: bugText, bugType });
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

  return (
    <Dialog open={isOpen} onClose={handleClose} modalId="bug-modal">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('bug.addBug')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
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

          <DialogFooter className="flex gap-3 mt-4">
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
        </form>
      </DialogContent>
    </Dialog>
  );
};
