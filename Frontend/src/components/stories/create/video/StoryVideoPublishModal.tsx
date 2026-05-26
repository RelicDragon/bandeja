import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X } from 'lucide-react';
import { FullScreenDialog } from '@/components/ui/FullScreenDialog';
import { StoryCaptionField } from '../StoryCaptionField';
import { StoryVideoPreview } from '../StoryVideoPreview';
import type { StoryMediaFile } from '../types/storyEditor.types';
import { useStoryVideoPublish } from './useStoryVideoPublish';

type StoryVideoPublishModalProps = {
  open: boolean;
  file: StoryMediaFile;
  onClose: () => void;
  onPublished: (segmentKey: string) => void;
};

function probeVideoDurationMs(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const ms = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0;
      URL.revokeObjectURL(url);
      resolve(ms);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    video.src = url;
  });
}

export function StoryVideoPublishModal({ open, file, onClose, onPublished }: StoryVideoPublishModalProps) {
  const { t } = useTranslation();
  const [caption, setCaption] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [durationMs, setDurationMs] = useState(0);
  const { publishVideo, isPublishing, progress } = useStoryVideoPublish();

  useEffect(() => {
    if (!open) {
      setCaption('');
      return;
    }
    const url = URL.createObjectURL(file.file);
    setPreviewUrl(url);
    void probeVideoDurationMs(file.file).then(setDurationMs);
    return () => URL.revokeObjectURL(url);
  }, [file.file, open]);

  const handleClose = useCallback(() => {
    if (isPublishing) return;
    onClose();
  }, [isPublishing, onClose]);

  const handleShare = useCallback(async () => {
    const key = await publishVideo(file, caption);
    if (key) {
      onPublished(key);
      onClose();
    }
  }, [caption, file, onClose, onPublished, publishVideo]);

  return (
    <FullScreenDialog open={open} onClose={handleClose} title={t('stories.createStory')} closeOnInteractOutside={false}>
      <div className="flex flex-col h-full min-h-[100dvh] bg-black text-white">
        <header className="flex items-center justify-between px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={handleClose}
            disabled={isPublishing}
            className="p-2 rounded-full bg-white/10 disabled:opacity-40"
            aria-label={t('common.cancel')}
          >
            <X size={22} />
          </button>
          <span className="text-sm font-medium">{t('stories.yourStory')}</span>
          <button
            type="button"
            disabled={isPublishing}
            onClick={() => void handleShare()}
            className="rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {isPublishing ? <Loader2 className="animate-spin" size={18} /> : t('stories.publish')}
          </button>
        </header>

        <div className="flex-1 flex items-center justify-center p-4 min-h-0">
          {previewUrl ? (
            <div className="h-full max-h-[70dvh] w-full max-w-sm aspect-[9/16]">
              <StoryVideoPreview videoUrl={previewUrl} durationMs={durationMs} />
            </div>
          ) : null}
        </div>

        {progress != null ? (
          <p className="text-center text-xs text-white/60 pb-2">{Math.round(progress * 100)}%</p>
        ) : null}

        <StoryCaptionField value={caption} onChange={setCaption} disabled={isPublishing} />
      </div>
    </FullScreenDialog>
  );
}
