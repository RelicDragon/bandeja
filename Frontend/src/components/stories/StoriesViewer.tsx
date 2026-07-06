import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FullScreenDialog } from '@/components/ui/FullScreenDialog';
import { useStoriesPlayback } from '@/hooks/useStoriesPlayback';
import { storyViewEntryFromSegment, useStoriesStore } from '@/store/storiesStore';
import type { StoryBubble } from '@/api/stories';
import { lightHaptic } from '@/utils/lightHaptic';
import { preloadStorySegmentMedia } from '@/utils/storySegmentMediaPreload';
import { storySegmentSlideVersion } from './storyPlayback';
import { StoriesViewerHeader } from './StoriesViewerHeader';
import { StoriesProgressBars } from './StoriesProgressBars';
import { StoriesGestureLayer } from './StoriesGestureLayer';
import { buildStoryViewerSlide } from './storiesViewerSlide';
import { StoryViewerEngagementChrome } from './viewer/StoryViewerEngagementChrome';
import {
  getStoryViewerEngagementPaused,
  storyViewerEngagementActions,
} from './viewer/storyViewerEngagementPause';

type StoriesViewerProps = {
  open: boolean;
  bubbles: StoryBubble[];
  initialBubbleIndex: number;
  initialSegmentIndex?: number;
  onClose: () => void;
  onBubbleChange?: (bubbleIndex: number) => void;
};

export function StoriesViewer({
  open,
  bubbles,
  initialBubbleIndex,
  initialSegmentIndex = 0,
  onClose,
  onBubbleChange,
}: StoriesViewerProps) {
  const navigate = useNavigate();
  const markViewed = useStoriesStore((s) => s.markViewed);
  const flushPendingViews = useStoriesStore((s) => s.flushPendingViews);
  const [bubbleIndex, setBubbleIndex] = useState(initialBubbleIndex);
  const [segmentIndex, setSegmentIndex] = useState(initialSegmentIndex);
  const [videoEnded, setVideoEnded] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoDurationMs, setVideoDurationMs] = useState<number | null>(null);
  const wasOpenRef = useRef(false);
  const doubleTapLikeRef = useRef<(() => void) | null>(null);
  const [doubleTapBurst, setDoubleTapBurst] = useState<{ x: number; y: number } | null>(null);
  const segmentNavKey = `${bubbleIndex}:${segmentIndex}`;

  useLayoutEffect(() => {
    if (!open) return;
    setBubbleIndex(initialBubbleIndex);
    setSegmentIndex(initialSegmentIndex);
    setVideoEnded(false);
    setVideoProgress(0);
    setVideoDurationMs(null);
  }, [open, initialBubbleIndex, initialSegmentIndex]);

  useLayoutEffect(() => {
    if (!open) return;
    setVideoEnded(false);
    setVideoProgress(0);
    setVideoDurationMs(null);
  }, [open, segmentNavKey]);

  useEffect(() => {
    if (open && !wasOpenRef.current) lightHaptic();
    wasOpenRef.current = open;
  }, [open]);

  const safeBubbleIndex =
    bubbles.length > 0 ? Math.min(bubbleIndex, bubbles.length - 1) : 0;
  const bubble = bubbles[safeBubbleIndex];
  const segments = useMemo(() => bubble?.segments ?? [], [bubble?.segments]);
  const safeSegmentIndex =
    segments.length > 0 ? Math.min(segmentIndex, segments.length - 1) : 0;
  const segment = segments[safeSegmentIndex];
  const slideVersion = segment ? storySegmentSlideVersion(segment) : null;
  const segmentRef = useRef(segment);
  segmentRef.current = segment;
  const bubbleRef = useRef(bubble);
  bubbleRef.current = bubble;

  const markCurrentSegmentViewed = useCallback(() => {
    const b = bubbleRef.current;
    const s = segmentRef.current;
    if (!b || !s || s.viewed) return;
    const entry = storyViewEntryFromSegment(s, b.user.id);
    if (entry) markViewed(entry);
  }, [markViewed]);

  const goNextSegment = useCallback(() => {
    markCurrentSegmentViewed();
    setVideoEnded(false);
    if (segmentIndex < segments.length - 1) {
      lightHaptic();
      setSegmentIndex((i) => i + 1);
      return;
    }
    if (bubbleIndex < bubbles.length - 1) {
      lightHaptic();
      const next = bubbleIndex + 1;
      setBubbleIndex(next);
      setSegmentIndex(0);
      onBubbleChange?.(next);
      return;
    }
    void flushPendingViews();
    lightHaptic();
    onClose();
  }, [
    markCurrentSegmentViewed,
    segmentIndex,
    segments.length,
    bubbleIndex,
    bubbles.length,
    onBubbleChange,
    flushPendingViews,
    onClose,
  ]);

  const handleMarkViewed = useCallback(() => {
    markCurrentSegmentViewed();
  }, [markCurrentSegmentViewed]);

  const handleDoubleTap = useCallback(
    (x: number, y: number) => {
      doubleTapLikeRef.current?.();
      setDoubleTapBurst({ x, y });
      window.setTimeout(() => setDoubleTapBurst(null), 700);
    },
    []
  );

  const registerDoubleTapLike = useCallback((handler: () => void) => {
    doubleTapLikeRef.current = handler;
  }, []);

  const playback = useStoriesPlayback({
    segment: segment ?? null,
    isActive: open && !!segment,
    onComplete: goNextSegment,
    onMarkViewed: handleMarkViewed,
    videoEnded,
    videoProgress,
    videoDurationMs,
  });
  const resetPlaybackRef = useRef(playback.resetPlayback);
  resetPlaybackRef.current = playback.resetPlayback;

  const goPrevSegment = useCallback(() => {
    if (segmentIndex > 0) {
      setVideoEnded(false);
      lightHaptic();
      setSegmentIndex((i) => i - 1);
      return;
    }
    if (bubbleIndex > 0) {
      setVideoEnded(false);
      lightHaptic();
      const prev = bubbleIndex - 1;
      const prevSegments = bubbles[prev]?.segments ?? [];
      setBubbleIndex(prev);
      setSegmentIndex(Math.max(0, prevSegments.length - 1));
      onBubbleChange?.(prev);
      return;
    }
    lightHaptic();
    setVideoEnded(false);
    setVideoProgress(0);
    resetPlaybackRef.current();
  }, [segmentIndex, bubbleIndex, bubbles, onBubbleChange]);

  useEffect(() => {
    if (!open) return;
    preloadStorySegmentMedia(segments[segmentIndex + 1]);
    const nextBubble = bubbles[bubbleIndex + 1];
    preloadStorySegmentMedia(nextBubble?.segments[0]);
  }, [open, segments, segmentIndex, bubbles, bubbleIndex]);

  const handleClose = useCallback(() => {
    lightHaptic();
    markCurrentSegmentViewed();
    void flushPendingViews();
    onClose();
  }, [markCurrentSegmentViewed, flushPendingViews, onClose]);

  const openGame = useCallback(
    (gameId: string) => {
      markCurrentSegmentViewed();
      void flushPendingViews();
      onClose();
      navigate(`/games/${gameId}`);
    },
    [markCurrentSegmentViewed, flushPendingViews, onClose, navigate]
  );

  const openBracket = useCallback(
    (path: string) => {
      markCurrentSegmentViewed();
      void flushPendingViews();
      onClose();
      navigate(path);
    },
    [markCurrentSegmentViewed, flushPendingViews, onClose, navigate]
  );

  useEffect(() => {
    if (!open) return;
    if (bubbles.length === 0) {
      void flushPendingViews();
      onClose();
      return;
    }
    if (bubbleIndex >= bubbles.length) {
      setBubbleIndex(Math.max(0, bubbles.length - 1));
      setSegmentIndex(0);
      setVideoEnded(false);
      return;
    }
    const segs = bubbles[bubbleIndex]?.segments ?? [];
    if (segs.length === 0) {
      if (bubbleIndex < bubbles.length - 1) {
        setBubbleIndex(bubbleIndex + 1);
        setSegmentIndex(0);
        setVideoEnded(false);
      } else {
        void flushPendingViews();
        onClose();
      }
      return;
    }
    if (segmentIndex >= segs.length) {
      setSegmentIndex(segs.length - 1);
      setVideoEnded(false);
    }
  }, [open, bubbles, bubbleIndex, segmentIndex, flushPendingViews, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (getStoryViewerEngagementPaused()) return;
      if (e.key === 'ArrowRight') goNextSegment();
      else if (e.key === 'ArrowLeft') goPrevSegment();
      else if (e.key === ' ') {
        e.preventDefault();
        playback.togglePause();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, goNextSegment, goPrevSegment, playback]);

  const slide = useMemo(() => {
    if (slideVersion == null || !segment || !bubble) return null;
    return buildStoryViewerSlide(segment, bubble, {
      open,
      openGame,
      openBracket,
      paused: playback.paused,
      replayGeneration: playback.replayGeneration,
      onVideoEnded: () => setVideoEnded(true),
      onVideoError: goNextSegment,
      onVideoProgress: setVideoProgress,
      onVideoDurationMs: setVideoDurationMs,
    });
  }, [slideVersion, segment, bubble, open, goNextSegment, openGame, openBracket, playback.replayGeneration, playback.paused]);

  if (!bubble) return null;

  return (
    <FullScreenDialog
      open={open}
      onClose={handleClose}
      title="Stories"
      closeOnInteractOutside={false}
      overlayClassName="fixed inset-0 z-50 bg-black"
      contentClassName="overflow-hidden"
      bodyClassName="overflow-hidden !overflow-hidden h-full min-h-0"
    >
      <div className="relative h-dvh min-h-0 w-full overflow-hidden bg-black pointer-events-auto">
        <StoriesGestureLayer
          className="absolute inset-0"
          reducedMotion={playback.reducedMotion}
          onTapLeft={goPrevSegment}
          onTapRight={goNextSegment}
          onLongPressStart={() => playback.setPaused(true)}
          onLongPressEnd={() => playback.setPaused(false)}
          onSwipeDown={handleClose}
          onSwipeUp={() => {
            lightHaptic();
            storyViewerEngagementActions.openComments();
          }}
          onSwipeLeft={() => {
            if (bubbleIndex < bubbles.length - 1) {
              lightHaptic();
              const next = bubbleIndex + 1;
              setBubbleIndex(next);
              setSegmentIndex(0);
              setVideoEnded(false);
              onBubbleChange?.(next);
            } else handleClose();
          }}
          onSwipeRight={() => {
            if (bubbleIndex > 0) {
              lightHaptic();
              const prev = bubbleIndex - 1;
              setBubbleIndex(prev);
              setSegmentIndex(0);
              setVideoEnded(false);
              onBubbleChange?.(prev);
            }
          }}
          onDoubleTap={handleDoubleTap}
        >
          <div className="absolute inset-0 overflow-hidden">{slide}</div>
        </StoriesGestureLayer>
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 min-h-[calc(env(safe-area-inset-top,0px)+9rem)] bg-gradient-to-b from-black/55 to-transparent">
          <StoriesProgressBars
            segments={segments}
            activeIndex={safeSegmentIndex}
            progress={playback.progress}
          />
          <StoriesViewerHeader user={bubble.user} createdAt={segment?.createdAt} onClose={handleClose} />
        </div>
        {segment ? (
          <StoryViewerEngagementChrome
            key={segment.key}
            segment={segment}
            owner={bubble.user}
            ownerUserId={bubble.user.id}
            initialEngagement={segment.engagement}
            viewerOpen={open}
            onRegisterDoubleTapLike={registerDoubleTapLike}
            onEscapeToClose={handleClose}
            doubleTapBurst={doubleTapBurst}
          />
        ) : null}
        {playback.reducedMotion && segment ? (
          <div className="absolute bottom-6 inset-x-0 flex justify-center z-40">
            <button
              type="button"
              className="px-4 py-2 rounded-full bg-white/20 text-white text-sm"
              onClick={() => {
                lightHaptic();
                playback.advanceManually();
              }}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    </FullScreenDialog>
  );
}
