import type { StorySegment } from '@/api/stories';

/** Identity for slide media — excludes engagement so likes do not remount the slide. */
export function storySegmentSlideVersion(segment: StorySegment): string {
  const base = `${segment.key}|${segment.viewed}|${segment.createdAt}|${segment.sourceType}`;
  switch (segment.sourceType) {
    case 'USER_STORY_ITEM':
      return `${base}|${segment.media.url}|${segment.media.type}|${segment.media.overlayText ?? ''}`;
    case 'GAME_PHOTO':
      return `${base}|${segment.media.url}`;
    case 'GAME_CREATED':
      return `${base}|${segment.game.id}`;
    case 'GAME_RESULT':
      return `${base}|${segment.game.id}`;
    default:
      return base;
  }
}

/** Wall-clock multiplier for story segment playback (2 = twice as fast). */
export const STORY_PLAYBACK_RATE = 1;

/** Extra time after expected video end before auto-advancing (covers codec/end-event gaps). */
export const STORY_VIDEO_END_BUFFER_MS = 2500;

/** Minimum wall-clock budget for a video segment fallback watchdog. */
export const STORY_VIDEO_FALLBACK_MIN_MS = 4000;

/** No `timeupdate` progress while playing → treat as broken/black. */
export const STORY_VIDEO_STALL_MS = 10_000;

export function computeVideoFallbackBudgetMs(
  segmentDurationMs: number,
  elementDurationMs?: number | null
): number {
  const fromSegment = Math.max(0, segmentDurationMs);
  const fromElement = elementDurationMs != null && elementDurationMs > 0 ? elementDurationMs : 0;
  const expected = Math.max(fromSegment, fromElement);
  return Math.max(expected + STORY_VIDEO_END_BUFFER_MS, STORY_VIDEO_FALLBACK_MIN_MS);
}
