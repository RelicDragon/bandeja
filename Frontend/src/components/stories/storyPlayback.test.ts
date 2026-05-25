import { describe, expect, it } from 'vitest';
import {
  STORY_VIDEO_END_BUFFER_MS,
  STORY_VIDEO_FALLBACK_MIN_MS,
  computeVideoFallbackBudgetMs,
} from './storyPlayback';

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
