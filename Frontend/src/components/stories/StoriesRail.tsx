import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { getHorizontalScrollFadeMaskStyle } from '@/components/HorizontalScrollFadeEdges';
import { useAuthStore } from '@/store/authStore';
import { useHorizontalScrollFade } from '@/hooks/useHorizontalScrollFade';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useStoriesFeed } from '@/hooks/useStoriesFeed';
import { useDeferredVisible } from '@/hooks/useDeferredVisible';
import { STAGGER_CHILDREN, STAGGER_ITEM_TRANSITION } from '@/components/motion/motionTokens';
import { StoriesRailBubble } from './StoriesRailBubble';
import { StoriesViewer } from './StoriesViewer';
import { StoryCreateSheet } from './create/StoryCreateSheet';
import { StoryPhotoEditor } from './create/photo/StoryPhotoEditor';
import { downscaleStoryImageFile } from './create/photo/utils/downscaleStoryImageFile';
import { StoryVideoPublishModal } from './create/video/StoryVideoPublishModal';
import type { StoryMediaFile } from './create/types/storyEditor.types';
import type { StoryMediaFile as PhotoMediaFile } from './create/photo/types';
import { runWithProfileName } from '@/utils/runWithProfileName';

const bubbleVariants = {
  hidden: { opacity: 0, scale: 0.88, x: 10 },
  visible: (index: number) => ({
    opacity: 1,
    scale: 1,
    x: 0,
    transition: {
      ...STAGGER_ITEM_TRANSITION,
      delay: index * STAGGER_CHILDREN,
    },
  }),
};

export function StoriesRail() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const reduceMotion = usePrefersReducedMotion();
  const railRootRef = useRef<HTMLDivElement>(null);
  const railVisible = useDeferredVisible(railRootRef);
  const { feed, refresh, enabled } = useStoriesFeed({ enabled: railVisible });
  const carouselRef = useRef<HTMLDivElement>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<PhotoMediaFile[] | null>(null);
  const [videoFile, setVideoFile] = useState<StoryMediaFile | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerBubbleIndex, setViewerBubbleIndex] = useState(0);
  const [viewerSegmentKey, setViewerSegmentKey] = useState<string | null>(null);
  const [viewerSessionId, setViewerSessionId] = useState(0);
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;

  const bubbles = useMemo(() => feed?.bubbles ?? [], [feed?.bubbles]);
  const { showLeftFade, showRightFade } = useHorizontalScrollFade(carouselRef, bubbles.length);
  const carouselMaskStyle = getHorizontalScrollFadeMaskStyle(showLeftFade, showRightFade);
  const serverBubbles = useMemo(() => bubbles.filter((b) => !b.isSelf), [bubbles]);
  const viewerBubbles = useMemo(() => {
    const list = [...bubbles];
    const selfIdx = list.findIndex((b) => b.isSelf);
    if (selfIdx > 0) {
      const [self] = list.splice(selfIdx, 1);
      list.unshift(self);
    }
    return list;
  }, [bubbles]);

  const openViewerAt = useCallback((bubbleIndex: number, segmentKey?: string | null) => {
    setViewerBubbleIndex(bubbleIndex);
    setViewerSegmentKey(segmentKey ?? null);
    setViewerSessionId((id) => id + 1);
    setViewerOpen(true);
  }, []);

  const handleCreateClick = useCallback(() => {
    if (offline) return;
    runWithProfileName(() => setCreateOpen(true));
  }, [offline]);

  useEffect(() => {
    const onOpenStoryCreate = () => {
      if (offline) return;
      runWithProfileName(() => setCreateOpen(true));
    };
    window.addEventListener('open-story-create', onOpenStoryCreate);
    return () => {
      window.removeEventListener('open-story-create', onOpenStoryCreate);
    };
  }, [offline]);

  const handleBubbleClick = useCallback(
    (userId: string) => {
      const idx = viewerBubbles.findIndex((b) => b.user.id === userId);
      if (idx >= 0) openViewerAt(idx);
    },
    [viewerBubbles, openViewerAt]
  );

  const handleFilesSelected = useCallback(
    (files: StoryMediaFile[]) => {
      const images = files.filter((f) => f.mediaType === 'IMAGE');
      const videos = files.filter((f) => f.mediaType === 'VIDEO');
      if (images.length > 0 && videos.length > 0) {
        toast.error(t('stories.mixedMediaBlocked'));
        return;
      }
      if (videos.length > 1) {
        toast.error(t('stories.oneVideoOnly'));
        return;
      }
      if (videos.length === 1) {
        setVideoFile(videos[0]!);
        return;
      }
      if (images.length > 0) {
        void (async () => {
          const prepared = await Promise.all(
            images.map(async (f) => ({
              file: await downscaleStoryImageFile(f.file),
              mediaType: 'IMAGE' as const,
            }))
          );
          setPhotoFiles(prepared);
        })();
      }
    },
    [t]
  );

  const initialSegmentIndex = useMemo(() => {
    if (!viewerSegmentKey) return 0;
    const bubble = viewerBubbles[viewerBubbleIndex];
    const idx = bubble?.segments.findIndex((s) => s.key === viewerSegmentKey);
    return idx != null && idx >= 0 ? idx : 0;
  }, [viewerSegmentKey, viewerBubbles, viewerBubbleIndex]);

  if (!enabled || !user) return null;

  const onlySelf = feed != null && serverBubbles.length === 0;
  const visibleBubbles = bubbles.filter(
    (bubble) => !(bubble.isSelf && bubble.segments.length === 0),
  );

  return (
    <>
      <div ref={railRootRef} className="px-4 mb-3 max-w-md mx-auto min-h-[5.75rem]">
        <AnimatePresence initial={false}>
          {onlySelf ? (
            <motion.p
              key="empty-hint"
              layout
              initial={reduceMotion ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.24, ease: [0.21, 0.47, 0.32, 0.98] }}
              className="text-xs text-gray-500 dark:text-gray-400 mb-2 overflow-hidden"
            >
              {t('stories.emptyHint')}
            </motion.p>
          ) : null}
        </AnimatePresence>
        <div className="relative -mx-4 px-4">
          <div
            ref={carouselRef}
            style={carouselMaskStyle}
            className="flex gap-3 overflow-x-auto overflow-y-hidden scrollbar-hide pb-1 [touch-action:pan-x_pan-y] overscroll-x-contain [-webkit-overflow-scrolling:touch]"
          >
            <motion.div
              custom={0}
              variants={bubbleVariants}
              initial={reduceMotion ? false : 'hidden'}
              animate="visible"
              className="shrink-0"
            >
              <StoriesRailBubble
                user={user}
                label={t('stories.yourStory')}
                hasUnseen={false}
                isSelf
                isCreate
                onClick={handleCreateClick}
              />
            </motion.div>
            <AnimatePresence mode="popLayout">
              {visibleBubbles.map((bubble, index) => {
                const label = bubble.isSelf
                  ? t('stories.yourStory')
                  : [bubble.user.firstName, bubble.user.lastName].filter(Boolean).join(' ') || '—';
                return (
                  <motion.div
                    key={bubble.user.id}
                    layout
                    custom={index + 1}
                    variants={bubbleVariants}
                    initial={reduceMotion ? false : 'hidden'}
                    animate="visible"
                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                    className="shrink-0"
                  >
                    <StoriesRailBubble
                      user={bubble.user}
                      label={label}
                      hasUnseen={bubble.hasUnseen}
                      previewThumbnailUrl={bubble.previewThumbnailUrl}
                      isSelf={bubble.isSelf}
                      onClick={() => handleBubbleClick(bubble.user.id)}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>
      <StoryCreateSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onFilesSelected={handleFilesSelected}
        disabled={offline}
      />
      {photoFiles ? (
        <StoryPhotoEditor
          open
          files={photoFiles}
          onClose={() => setPhotoFiles(null)}
          onPublished={(segmentKey) => {
            void refresh(true).then(() => {
              openViewerAt(0, segmentKey);
            });
          }}
        />
      ) : null}
      {videoFile ? (
        <StoryVideoPublishModal
          open
          file={videoFile}
          onClose={() => setVideoFile(null)}
          onPublished={(segmentKey) => {
            void refresh(true).then(() => {
              openViewerAt(0, segmentKey);
            });
          }}
        />
      ) : null}
      <StoriesViewer
        key={viewerSessionId}
        open={viewerOpen}
        bubbles={viewerBubbles}
        initialBubbleIndex={viewerBubbleIndex}
        initialSegmentIndex={initialSegmentIndex}
        onClose={() => {
          setViewerOpen(false);
          setViewerSegmentKey(null);
          void refresh(true);
        }}
        onBubbleChange={setViewerBubbleIndex}
      />
    </>
  );
}
