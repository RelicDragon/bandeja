import { useCallback, useEffect, useRef, useState } from 'react';
import { getStorySegmentDurationMs, STORY_MARK_VIEWED_MS, type StorySegment } from '@/api/stories';
import {
  computeVideoFallbackBudgetMs,
  STORY_PLAYBACK_RATE,
} from '@/components/stories/storyPlayback';
import { useStoryViewerEngagementPaused } from '@/components/stories/viewer/storyViewerEngagementPause';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

type UseStoriesPlaybackOptions = {
  segment: StorySegment | null;
  isActive: boolean;
  onComplete: () => void;
  onMarkViewed: () => void;
  videoEnded?: boolean;
  videoProgress?: number;
  /** Measured from the <video> element when metadata loads (overrides short API duration). */
  videoDurationMs?: number | null;
};

const VIDEO_FALLBACK_TICK_MS = 250;

export function resolveStoryVideoProgressFill({
  segmentKey,
  appliedSegmentKey,
  videoProgress,
}: {
  segmentKey: string;
  appliedSegmentKey: string | null;
  videoProgress: number;
}): number | null {
  if (appliedSegmentKey !== segmentKey) {
    return videoProgress === 0 ? 0 : null;
  }
  return Math.min(1, Math.max(0, videoProgress));
}

export function useStoriesPlayback({
  segment,
  isActive,
  onComplete,
  onMarkViewed,
  videoEnded = false,
  videoProgress = 0,
  videoDurationMs = null,
}: UseStoriesPlaybackOptions) {
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [replayGeneration, setReplayGeneration] = useState(0);
  const engagementPaused = useStoryViewerEngagementPaused();
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const elapsedBeforePauseRef = useRef(0);
  const markedRef = useRef(false);
  const markTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoFallbackRemainingRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  const onMarkViewedRef = useRef(onMarkViewed);
  const segmentKeyRef = useRef<string | null>(null);
  const appliedVideoSegmentKeyRef = useRef<string | null>(null);

  onCompleteRef.current = onComplete;
  onMarkViewedRef.current = onMarkViewed;

  const segmentKey = segment?.key ?? null;
  segmentKeyRef.current = segmentKey;
  const durationMs = segment ? getStorySegmentDurationMs(segment) : 0;
  const isVideo =
    segment?.sourceType === 'USER_STORY_ITEM' && segment.media.type === 'VIDEO';
  const playbackDurationMs =
    !isVideo && durationMs > 0 ? durationMs / STORY_PLAYBACK_RATE : durationMs;
  const reducedMotion = usePrefersReducedMotion();
  const effectivePaused = paused || engagementPaused;

  const clearMarkTimer = useCallback(() => {
    if (markTimerRef.current) {
      clearTimeout(markTimerRef.current);
      markTimerRef.current = null;
    }
  }, []);

  const stopRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const resetPlayback = useCallback(() => {
    stopRaf();
    clearMarkTimer();
    setProgress(0);
    setPaused(false);
    startedAtRef.current = null;
    elapsedBeforePauseRef.current = 0;
    markedRef.current = false;
    videoFallbackRemainingRef.current = 0;
    appliedVideoSegmentKeyRef.current = null;
    setReplayGeneration((g) => g + 1);
  }, [clearMarkTimer, stopRaf]);

  useEffect(() => {
    resetPlayback();
  }, [segmentKey, resetPlayback]);

  useEffect(() => {
    if (!isActive || !segmentKey) return;
    clearMarkTimer();
    markTimerRef.current = setTimeout(() => {
      if (!markedRef.current) {
        markedRef.current = true;
        onMarkViewedRef.current();
      }
    }, isVideo ? STORY_MARK_VIEWED_MS : STORY_MARK_VIEWED_MS / STORY_PLAYBACK_RATE);
    return clearMarkTimer;
  }, [segmentKey, isActive, isVideo, clearMarkTimer, replayGeneration]);

  useEffect(() => {
    if (!isActive || !isVideo || !segmentKey) return;
    if (effectivePaused) return;
    const fill = resolveStoryVideoProgressFill({
      segmentKey,
      appliedSegmentKey: appliedVideoSegmentKeyRef.current,
      videoProgress,
    });
    if (fill == null) return;
    appliedVideoSegmentKeyRef.current = segmentKey;
    setProgress(fill);
  }, [segmentKey, isActive, isVideo, effectivePaused, videoProgress]);

  useEffect(() => {
    if (!isActive || !segmentKey || !isVideo || videoEnded) return;

    const budgetMs = computeVideoFallbackBudgetMs(durationMs, videoDurationMs);
    videoFallbackRemainingRef.current = budgetMs;

    const id = setInterval(() => {
      if (videoEnded) return;
      if (effectivePaused) return;
      videoFallbackRemainingRef.current -= VIDEO_FALLBACK_TICK_MS;
      if (videoFallbackRemainingRef.current <= 0) {
        clearInterval(id);
        setProgress(1);
        onCompleteRef.current();
      }
    }, VIDEO_FALLBACK_TICK_MS);

    return () => clearInterval(id);
  }, [segmentKey, isActive, isVideo, effectivePaused, videoEnded, durationMs, videoDurationMs, replayGeneration]);

  useEffect(() => {
    if (!isActive || !segmentKey || effectivePaused || reducedMotion) {
      stopRaf();
      return;
    }

    if (isVideo) {
      if (videoEnded) {
        setProgress(1);
        onCompleteRef.current();
      }
      return;
    }

    const capturedSegmentKey = segmentKey;
    if (startedAtRef.current == null) {
      startedAtRef.current = performance.now();
    }
    const tick = (now: number) => {
      if (segmentKeyRef.current !== capturedSegmentKey) return;
      const started = startedAtRef.current ?? now;
      const elapsed = elapsedBeforePauseRef.current + (now - started);
      const p = playbackDurationMs > 0 ? Math.min(1, elapsed / playbackDurationMs) : 1;
      setProgress(p);
      if (p >= 1) {
        stopRaf();
        onCompleteRef.current();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return stopRaf;
  }, [segmentKey, isActive, effectivePaused, reducedMotion, isVideo, videoEnded, playbackDurationMs, stopRaf, replayGeneration]);

  const togglePause = useCallback(() => {
    setPaused((prev) => {
      const next = !prev;
      if (next) {
        if (startedAtRef.current != null) {
          elapsedBeforePauseRef.current += performance.now() - startedAtRef.current;
          startedAtRef.current = null;
        }
        stopRaf();
      } else {
        startedAtRef.current = performance.now();
      }
      return next;
    });
  }, [stopRaf]);

  const setPausedExplicit = useCallback(
    (value: boolean) => {
      setPaused((prev) => {
        if (prev === value) return prev;
        if (value) {
          if (startedAtRef.current != null) {
            elapsedBeforePauseRef.current += performance.now() - startedAtRef.current;
            startedAtRef.current = null;
          }
          stopRaf();
        } else {
          startedAtRef.current = performance.now();
        }
        return value;
      });
    },
    [stopRaf]
  );

  const forceMarkViewed = useCallback(() => {
    if (markedRef.current) return;
    markedRef.current = true;
    clearMarkTimer();
    onMarkViewedRef.current();
  }, [clearMarkTimer]);

  const advanceManually = useCallback(() => {
    stopRaf();
    setProgress(1);
    onCompleteRef.current();
  }, [stopRaf]);

  return {
    progress,
    paused,
    durationMs,
    isVideo,
    reducedMotion,
    togglePause,
    setPaused: setPausedExplicit,
    forceMarkViewed,
    advanceManually,
    resetPlayback,
    replayGeneration,
  };
}
