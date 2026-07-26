import { describe, expect, it } from 'vitest';
import {
  STORY_VIDEO_END_BUFFER_MS,
  STORY_VIDEO_FALLBACK_MIN_MS,
  computeVideoFallbackBudgetMs,
  shouldReportStoryProgress,
  storySegmentSlideVersion,
} from './storyPlayback';
import type { StorySegment } from '@/api/stories';

describe('computeVideoFallbackBudgetMs', () => {
  it('uses segment duration plus buffer when element duration is unknown', () => {
    expect(computeVideoFallbackBudgetMs(5000, null)).toBe(5000 + STORY_VIDEO_END_BUFFER_MS);
  });

  it('uses the longer of segment vs element duration', () => {
    expect(computeVideoFallbackBudgetMs(5000, 45_000)).toBe(45_000 + STORY_VIDEO_END_BUFFER_MS);
    expect(computeVideoFallbackBudgetMs(60_000, 12_000)).toBe(60_000 + STORY_VIDEO_END_BUFFER_MS);
  });

  it('never goes below minimum fallback', () => {
    expect(computeVideoFallbackBudgetMs(500, null)).toBe(STORY_VIDEO_FALLBACK_MIN_MS);
  });
});

describe('shouldReportStoryProgress', () => {
  it('always reports completion', () => {
    expect(shouldReportStoryProgress(0.5, 1, 0, 0)).toBe(true);
  });

  it('does not let repeated zero progress bypass the throttle', () => {
    expect(shouldReportStoryProgress(0, 0, 1000, 1001)).toBe(false);
  });

  it('allows reset from mid-progress back to zero', () => {
    expect(shouldReportStoryProgress(0.4, 0, 1000, 1100)).toBe(true);
  });

  it('suppresses sub-epsilon updates inside the min interval', () => {
    expect(shouldReportStoryProgress(0.4, 0.405, 1000, 1020)).toBe(false);
  });

  it('reports meaningful progress after the min interval', () => {
    expect(shouldReportStoryProgress(0.4, 0.42, 1000, 1100)).toBe(true);
  });
});

describe('storySegmentSlideVersion', () => {
  it('does not change when only viewed flips', () => {
    const base = {
      key: 'USER_STORY_ITEM:1',
      createdAt: '2026-01-01T00:00:00.000Z',
      sourceType: 'USER_STORY_ITEM' as const,
      media: {
        url: 'https://cdn.example/a.jpg',
        thumbnailUrl: 'https://cdn.example/a-t.jpg',
        type: 'IMAGE' as const,
      },
    };
    const unseen = { ...base, viewed: false } as StorySegment;
    const seen = { ...base, viewed: true } as StorySegment;
    expect(storySegmentSlideVersion(unseen)).toBe(storySegmentSlideVersion(seen));
  });
});
