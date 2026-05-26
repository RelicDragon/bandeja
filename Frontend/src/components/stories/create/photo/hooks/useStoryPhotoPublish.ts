import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  storiesApi,
  type CreateStoryItemPayload,
  type StoryImageUploadResponse,
} from '@/api/stories';
import { useStoriesStore } from '@/store/storiesStore';
import type { StoryDocument, StorySession } from '../types';
import { drawScene } from '../utils/drawScene';
import { ensureDocumentMediaDimensions } from '../utils/ensureMediaDimensions';

type PublishStep = 'export' | 'upload' | 'create';

class StoryPhotoPublishError extends Error {
  readonly step: PublishStep;

  constructor(step: PublishStep) {
    super(step);
    this.name = 'StoryPhotoPublishError';
    this.step = step;
  }
}

function publishStepKey(step: PublishStep): string {
  switch (step) {
    case 'export':
      return 'stories.editor.publishExportFailed';
    case 'upload':
      return 'stories.editor.publishUploadFailed';
    case 'create':
      return 'stories.editor.publishCreateFailed';
  }
}

export function buildPhotoCreateItemPayload(
  uploaded: StoryImageUploadResponse,
  caption: string | undefined,
  clientUploadId: string
): CreateStoryItemPayload {
  return {
    mediaUrl: uploaded.mediaUrl,
    thumbnailUrl: uploaded.thumbnailUrl,
    messageType: 'IMAGE',
    width: uploaded.width,
    height: uploaded.height,
    caption,
    clientUploadId,
  };
}

export async function publishStoryPhotoDocument(
  doc: StoryDocument,
  options?: { caption?: string; clientUploadId?: string }
): Promise<string> {
  const trimmedCaption = options?.caption?.trim() || undefined;
  const clientUploadId = options?.clientUploadId ?? storiesApi.newClientUploadId();

  let blob: Blob;
  try {
    const resolved = await ensureDocumentMediaDimensions(doc);
    blob = await drawScene(resolved);
  } catch {
    throw new StoryPhotoPublishError('export');
  }

  if (blob.type !== 'image/jpeg') {
    throw new StoryPhotoPublishError('export');
  }

  const file = new File([blob], `story-${clientUploadId}.jpg`, { type: 'image/jpeg' });

  let uploaded;
  try {
    uploaded = await storiesApi.uploadImage(file);
  } catch {
    throw new StoryPhotoPublishError('upload');
  }

  let segment;
  try {
    segment = await storiesApi.createItem(
      buildPhotoCreateItemPayload(uploaded, trimmedCaption, clientUploadId)
    );
  } catch {
    throw new StoryPhotoPublishError('create');
  }

  return segment.key;
}

export function useStoryPhotoPublish() {
  const { t } = useTranslation();
  const fetchFeed = useStoriesStore((s) => s.fetchFeed);
  const [isPublishing, setIsPublishing] = useState(false);

  const publishSession = useCallback(
    async (session: StorySession): Promise<string | null> => {
      const { segments, caption } = session;
      if (segments.length === 0 || isPublishing) return null;
      setIsPublishing(true);
      const batchId = storiesApi.newClientUploadId();
      let lastSegmentKey: string | null = null;
      const trimmedCaption = caption?.trim() || undefined;

      try {
        for (let i = 0; i < segments.length; i++) {
          const clientUploadId = `${batchId}-${i}`;
          lastSegmentKey = await publishStoryPhotoDocument(segments[i]!, {
            caption: trimmedCaption,
            clientUploadId,
          });
        }
        await fetchFeed(true);
        toast.success(t('stories.published'));
        return lastSegmentKey;
      } catch (err) {
        const key =
          err instanceof StoryPhotoPublishError ? publishStepKey(err.step) : 'stories.publishFailed';
        toast.error(t(key));
        return null;
      } finally {
        setIsPublishing(false);
      }
    },
    [fetchFeed, isPublishing, t]
  );

  return { publishSession, isPublishing };
}
