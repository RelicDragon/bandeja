import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  parseStorySegmentKey,
  storiesApi,
  type CreateStoryItemPayload,
  type StoryImageUploadResponse,
} from '@/api/stories';
import { useStoriesStore } from '@/store/storiesStore';
import type { StoryDocument, StorySession } from '../types';
import { drawScene } from '../utils/drawScene';
import { prepareDocumentForExport } from '../utils/prepareDocumentForExport';
import { storyDocumentContentHash } from '../utils/storyDocumentContentHash';

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

type SlotProgress = {
  contentHash: string;
  clientUploadId: string;
  segmentKey: string | null;
};

type PublishProgress = {
  slots: SlotProgress[];
};

async function deletePublishedSegmentKey(segmentKey: string): Promise<void> {
  const parsed = parseStorySegmentKey(segmentKey);
  if (!parsed || parsed.sourceType !== 'USER_STORY_ITEM') return;
  await storiesApi.deleteItem(parsed.sourceId);
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
    const resolved = await prepareDocumentForExport(doc);
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
  const publishingRef = useRef(false);
  const progressRef = useRef<PublishProgress | null>(null);

  const abandonPartialPublish = useCallback(async (): Promise<void> => {
    const progress = progressRef.current;
    progressRef.current = null;
    if (!progress) return;
    const keys = progress.slots.map((s) => s.segmentKey).filter((k): k is string => !!k);
    if (keys.length === 0) return;
    const results = await Promise.allSettled(keys.map((key) => deletePublishedSegmentKey(key)));
    const failed = results.some((r) => r.status === 'rejected');
    if (failed) {
      toast.error(t('stories.editor.publishOrphanCleanupFailed'));
    }
  }, [t]);

  const hasPartialPublish = useCallback((): boolean => {
    const progress = progressRef.current;
    if (!progress) return false;
    return progress.slots.some((s) => s.segmentKey != null);
  }, []);

  const publishSession = useCallback(
    async (session: StorySession): Promise<string | null> => {
      const { segments, caption } = session;
      if (segments.length === 0 || publishingRef.current) return null;
      publishingRef.current = true;
      setIsPublishing(true);
      const trimmedCaption = caption?.trim() || undefined;

      if (!progressRef.current) {
        progressRef.current = { slots: [] };
      }
      const progress = progressRef.current;
      while (progress.slots.length < segments.length) {
        progress.slots.push({
          contentHash: '',
          clientUploadId: storiesApi.newClientUploadId(),
          segmentKey: null,
        });
      }
      if (progress.slots.length > segments.length) {
        const removed = progress.slots.splice(segments.length);
        await Promise.allSettled(
          removed
            .map((s) => s.segmentKey)
            .filter((k): k is string => !!k)
            .map((key) => deletePublishedSegmentKey(key))
        );
      }

      let lastSegmentKey: string | null = null;

      try {
        for (let i = 0; i < segments.length; i++) {
          const doc = segments[i]!;
          const contentHash = storyDocumentContentHash(doc, trimmedCaption);
          let slot = progress.slots[i]!;

          if (slot.segmentKey && slot.contentHash === contentHash) {
            lastSegmentKey = slot.segmentKey;
            continue;
          }

          if (slot.contentHash !== contentHash) {
            if (slot.segmentKey) {
              try {
                await deletePublishedSegmentKey(slot.segmentKey);
              } catch {
                // Continue — re-publish with a fresh clientUploadId.
              }
            }
            slot = {
              contentHash,
              clientUploadId: storiesApi.newClientUploadId(),
              segmentKey: null,
            };
            progress.slots[i] = slot;
          } else if (!slot.clientUploadId) {
            slot.clientUploadId = storiesApi.newClientUploadId();
          }

          lastSegmentKey = await publishStoryPhotoDocument(doc, {
            caption: trimmedCaption,
            clientUploadId: slot.clientUploadId,
          });
          slot.segmentKey = lastSegmentKey;
          slot.contentHash = contentHash;
        }

        try {
          await fetchFeed(true);
        } catch {
          toast.success(t('stories.published'));
          toast.error(t('stories.editor.publishFeedRefreshFailed'));
          progressRef.current = null;
          return lastSegmentKey;
        }

        toast.success(t('stories.published'));
        progressRef.current = null;
        return lastSegmentKey;
      } catch (err) {
        const partial = progress.slots.some((s) => s.segmentKey != null);
        const key =
          partial
            ? 'stories.editor.publishPartialFailed'
            : err instanceof StoryPhotoPublishError
              ? publishStepKey(err.step)
              : 'stories.publishFailed';
        toast.error(t(key));
        return null;
      } finally {
        publishingRef.current = false;
        setIsPublishing(false);
      }
    },
    [fetchFeed, t]
  );

  return {
    publishSession,
    isPublishing,
    abandonPartialPublish,
    hasPartialPublish,
  };
}
