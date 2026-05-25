import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  storyEngagementApi,
  STORY_COMMENT_MAX_CHARS,
  type StoryCommentDto,
  type StoryCommentReportReason,
} from '@/api/storyEngagement';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';

type ReportStoryCommentModalProps = {
  isOpen: boolean;
  comment: StoryCommentDto | null;
  onClose: () => void;
};

export function ReportStoryCommentModal({ isOpen, comment, onClose }: ReportStoryCommentModalProps) {
  const { t } = useTranslation();
  const [selectedReason, setSelectedReason] = useState<StoryCommentReportReason | null>(null);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSelectedReason(null);
      setDescription('');
    }
  }, [isOpen]);

  const handleSubmit = useCallback(async () => {
    if (!comment) return;
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
      await storyEngagementApi.reportComment(comment.id, {
        reason: selectedReason,
        description: selectedReason === 'OTHER' ? description.trim() : undefined,
      });
      toast.success(t('chat.report.success'));
      onClose();
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        t('chat.report.error');
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [comment, description, onClose, selectedReason, t]);

  if (!isOpen || !comment) return null;

  const reasons: { value: StoryCommentReportReason; label: string }[] = [
    { value: 'SPAM', label: t('chat.report.reasons.SPAM') },
    { value: 'HARASSMENT', label: t('chat.report.reasons.HARASSMENT') },
    { value: 'INAPPROPRIATE_CONTENT', label: t('chat.report.reasons.INAPPROPRIATE_CONTENT') },
    { value: 'FAKE_INFORMATION', label: t('chat.report.reasons.FAKE_INFORMATION') },
    { value: 'OTHER', label: t('chat.report.reasons.OTHER') },
  ];

  return (
    <Dialog open={isOpen} onClose={onClose} modalId="report-story-comment-modal">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('stories.viewer.reportTitle')}</DialogTitle>
        </DialogHeader>
        <div className="p-6 overflow-y-auto flex-1">
          <DialogDescription className="mb-6">{t('chat.report.description')}</DialogDescription>
          <div className="space-y-2" role="radiogroup" aria-label={t('chat.report.selectReason')}>
            {reasons.map((reason) => (
              <label
                key={reason.value}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedReason === reason.value
                    ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <input
                  type="radio"
                  name="story-comment-report-reason"
                  value={reason.value}
                  checked={selectedReason === reason.value}
                  onChange={() => setSelectedReason(reason.value)}
                  className="text-sky-500"
                />
                <span className="text-sm text-gray-900 dark:text-gray-100">{reason.label}</span>
              </label>
            ))}
          </div>
          {selectedReason === 'OTHER' ? (
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, STORY_COMMENT_MAX_CHARS))}
              placeholder={t('chat.report.descriptionPlaceholder')}
              className="mt-4 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 min-h-[80px] resize-none"
            />
          ) : null}
          <div className="mt-6 flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm rounded-lg bg-sky-500 text-white disabled:opacity-60"
            >
              {t('chat.report.submit')}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}