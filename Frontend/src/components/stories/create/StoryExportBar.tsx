import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X } from 'lucide-react';

type StoryExportBarProps = {
  isDirty: boolean;
  isPublishing: boolean;
  progress: number | null;
  onClose: () => void;
  onShare: () => void;
};

export function StoryExportBar({ isDirty, isPublishing, progress, onClose, onShare }: StoryExportBarProps) {
  const { t } = useTranslation();

  const handleClose = useCallback(() => {
    if (isPublishing) return;
    if (isDirty && !window.confirm(t('stories.editor.discardConfirm'))) return;
    onClose();
  }, [isDirty, isPublishing, onClose, t]);

  return (
    <div className="relative z-50 flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
      <button
        type="button"
        onClick={handleClose}
        disabled={isPublishing}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm disabled:opacity-50"
        aria-label={t('common.cancel')}
      >
        <X size={22} />
      </button>
      <span className="text-sm font-medium text-white/90">{t('stories.createStory')}</span>
      <button
        type="button"
        onClick={onShare}
        disabled={isPublishing}
        className="flex min-w-[5.5rem] items-center justify-center rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-lg disabled:opacity-60"
      >
        {isPublishing ? (
          progress != null ? (
            `${Math.round(progress * 100)}%`
          ) : (
            <Loader2 className="animate-spin" size={18} />
          )
        ) : (
          t('stories.publish')
        )}
      </button>
    </div>
  );
}
