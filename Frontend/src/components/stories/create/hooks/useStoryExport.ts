import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { storiesApi } from '@/api/stories';
import { prepareChatVideoForSend } from '@/services/chat/chatVideoTranscode';
import { useStoriesStore } from '@/store/storiesStore';
import type { StorySlide } from '../types/storyEditor.types';
import { buildOverlayStyleV2 } from '../types/storyEditor.types';
import { exportStoryImage } from '../utils/storyCanvasExport';
import { ensureSlideNaturalDimensions } from '../utils/storySlideNaturalSize';

type PublishStep = 'export' | 'transcode' | 'upload' | 'create';

class StoryPublishError extends Error {
  readonly step: PublishStep;

  constructor(step: PublishStep) {
    super(step);
    this.name = 'StoryPublishError';
    this.step = step;
  }
}

function publishStepKey(step: PublishStep): string {
  switch (step) {
    case 'export':
      return 'stories.editor.publishExportFailed';
    case 'transcode':
      return 'stories.editor.publishTranscodeFailed';
    case 'upload':
      return 'stories.editor.publishUploadFailed';
    case 'create':
      return 'stories.editor.publishCreateFailed';
  }
}

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

export function useStoryExport() {
  const { t } = useTranslation();
  const fetchFeed = useStoriesStore((s) => s.fetchFeed);
  const [isPublishing, setIsPublishing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const publishSlides = useCallback(
    async (slides: StorySlide[], caption?: string): Promise<string | null> => {
      if (slides.length === 0 || isPublishing) return null;
      setIsPublishing(true);
      setProgress(null);
      const batchId = storiesApi.newClientUploadId();
      let lastSegmentKey: string | null = null;
      const trimmedCaption = caption?.trim() || undefined;

      try {
        for (let i = 0; i < slides.length; i++) {
          const slide = await ensureSlideNaturalDimensions(slides[i]!);
          const clientUploadId = `${batchId}-${i}`;
          const overlayText = slide.layers
            .filter((l) => l.type === 'text')
            .map((l) => l.text)
            .join(' ')
            .trim();

          if (slide.media.type === 'IMAGE') {
            let blob: Blob;
            try {
              blob = await exportStoryImage(slide);
            } catch {
              throw new StoryPublishError('export');
            }
            const file = new File([blob], `story-${slide.id}.jpg`, { type: 'image/jpeg' });
            let uploaded;
            try {
              uploaded = await storiesApi.uploadImage(file);
            } catch {
              throw new StoryPublishError('upload');
            }
            let segment;
            try {
              segment = await storiesApi.createItem({
                mediaUrl: uploaded.mediaUrl,
                thumbnailUrl: uploaded.thumbnailUrl,
                messageType: 'IMAGE',
                width: uploaded.width,
                height: uploaded.height,
                overlayText: overlayText || undefined,
                overlayStyle: { ...buildOverlayStyleV2(slide), baked: true },
                caption: trimmedCaption,
                clientUploadId,
              });
            } catch {
              throw new StoryPublishError('create');
            }
            lastSegmentKey = segment.key;
          } else {
            const durationMs = await probeVideoDurationMs(slide.media.file);
            const trim = slide.videoTrim;
            const endMs = trim?.endMs && trim.endMs > 0 ? trim.endMs : durationMs;
            let prepared;
            try {
              prepared = await prepareChatVideoForSend(slide.media.file, `story-${slide.id}`, {
                onTranscodeProgress: (p) => setProgress(p),
                trim: trim ? { startMs: trim.startMs, endMs: endMs } : undefined,
              });
            } catch {
              throw new StoryPublishError('transcode');
            }
            let uploaded;
            try {
              uploaded = await storiesApi.uploadVideo(prepared.videoFile, {
                posterFile: new File([prepared.posterBlob], 'poster.jpg', { type: 'image/jpeg' }),
                durationMs: prepared.durationMs,
                width: prepared.width,
                height: prepared.height,
              });
            } catch {
              throw new StoryPublishError('upload');
            }
            let segment;
            try {
              segment = await storiesApi.createItem({
                mediaUrl: uploaded.mediaUrl,
                thumbnailUrl: uploaded.thumbnailUrl,
                posterUrl: uploaded.posterUrl ?? undefined,
                messageType: 'VIDEO',
                videoDurationMs: uploaded.durationMs,
                width: uploaded.width,
                height: uploaded.height,
                overlayText: overlayText || undefined,
                overlayStyle: buildOverlayStyleV2(slide),
                caption: trimmedCaption,
                clientUploadId,
              });
            } catch {
              throw new StoryPublishError('create');
            }
            lastSegmentKey = segment.key;
          }
        }
        await fetchFeed(true);
        toast.success(t('stories.published'));
        return lastSegmentKey;
      } catch (err) {
        const key = err instanceof StoryPublishError ? publishStepKey(err.step) : 'stories.publishFailed';
        toast.error(t(key));
        return null;
      } finally {
        setIsPublishing(false);
        setProgress(null);
      }
    },
    [fetchFeed, isPublishing, t]
  );

  return { publishSlides, isPublishing, progress };
}
