import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  storiesApi,
  type CreateStoryItemPayload,
  type StoryVideoUploadResponse,
} from '@/api/stories';
import { prepareChatVideoForSend } from '@/services/chat/chatVideoTranscode';
import { useStoriesStore } from '@/store/storiesStore';
import type { StoryMediaFile } from '../types/storyEditor.types';

type PublishStep = 'transcode' | 'upload' | 'create';

class StoryVideoPublishError extends Error {
  readonly step: PublishStep;

  constructor(step: PublishStep) {
    super(step);
    this.name = 'StoryVideoPublishError';
    this.step = step;
  }
}

function publishStepKey(step: PublishStep): string {
  switch (step) {
    case 'transcode':
      return 'stories.editor.publishTranscodeFailed';
    case 'upload':
      return 'stories.editor.publishUploadFailed';
    case 'create':
      return 'stories.editor.publishCreateFailed';
  }
}

export function buildVideoCreateItemPayload(
  uploaded: StoryVideoUploadResponse,
  caption: string | undefined,
  clientUploadId: string
): CreateStoryItemPayload {
  return {
    mediaUrl: uploaded.mediaUrl,
    thumbnailUrl: uploaded.thumbnailUrl,
    posterUrl: uploaded.posterUrl ?? undefined,
    messageType: 'VIDEO',
    videoDurationMs: uploaded.durationMs,
    width: uploaded.width,
    height: uploaded.height,
    caption,
    clientUploadId,
  };
}

export async function publishStoryVideoFile(
  file: File,
  options?: { caption?: string; clientUploadId?: string; onTranscodeProgress?: (p: number) => void }
): Promise<string> {
  const trimmedCaption = options?.caption?.trim() || undefined;
  const clientUploadId = options?.clientUploadId ?? storiesApi.newClientUploadId();
  const storyId = `story-video-${clientUploadId}`;

  let prepared;
  try {
    prepared = await prepareChatVideoForSend(file, storyId, {
      onTranscodeProgress: options?.onTranscodeProgress,
    });
  } catch {
    throw new StoryVideoPublishError('transcode');
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
    throw new StoryVideoPublishError('upload');
  }

  let segment;
  try {
    segment = await storiesApi.createItem(
      buildVideoCreateItemPayload(uploaded, trimmedCaption, clientUploadId)
    );
  } catch {
    throw new StoryVideoPublishError('create');
  }

  return segment.key;
}

export function useStoryVideoPublish() {
  const { t } = useTranslation();
  const fetchFeed = useStoriesStore((s) => s.fetchFeed);
  const [isPublishing, setIsPublishing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const publishVideo = useCallback(
    async (media: StoryMediaFile, caption?: string): Promise<string | null> => {
      if (media.mediaType !== 'VIDEO' || isPublishing) return null;
      setIsPublishing(true);
      setProgress(null);
      try {
        const key = await publishStoryVideoFile(media.file, {
          caption,
          onTranscodeProgress: (p) => setProgress(p),
        });
        await fetchFeed(true);
        toast.success(t('stories.published'));
        return key;
      } catch (err) {
        const key =
          err instanceof StoryVideoPublishError ? publishStepKey(err.step) : 'stories.publishFailed';
        toast.error(t(key));
        return null;
      } finally {
        setIsPublishing(false);
        setProgress(null);
      }
    },
    [fetchFeed, isPublishing, t]
  );

  return { publishVideo, isPublishing, progress };
}
