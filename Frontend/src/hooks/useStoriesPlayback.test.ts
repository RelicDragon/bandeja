import { describe, expect, it } from 'vitest';
import { resolveStoryVideoProgressFill } from './useStoriesPlayback';
import { shouldReportStoryProgress } from '@/components/stories/storyPlayback';

describe('resolveStoryVideoProgressFill', () => {
  it('ignores stale videoProgress immediately after segment change', () => {
    expect(
      resolveStoryVideoProgressFill({
        segmentKey: 'seg-a',
        appliedSegmentKey: 'seg-b',
        videoProgress: 0.62,
      })
    ).toBeNull();
  });

  it('accepts zero progress when entering a new segment', () => {
    expect(
      resolveStoryVideoProgressFill({
        segmentKey: 'seg-a',
        appliedSegmentKey: 'seg-b',
        videoProgress: 0,
      })
    ).toBe(0);
  });

  it('tracks in-segment video progress after segment is applied', () => {
    expect(
      resolveStoryVideoProgressFill({
        segmentKey: 'seg-a',
        appliedSegmentKey: 'seg-a',
        videoProgress: 0.42,
      })
    ).toBe(0.42);
  });
});

describe('story playback progress throttle seam', () => {
  it('caps React progress churn below frame rate for mid-segment ticks', () => {
    let reports = 0;
    let value = 0;
    let atMs = 0;
    for (let i = 0; i < 60; i += 1) {
      const next = i / 60;
      const now = i * (1000 / 60);
      if (shouldReportStoryProgress(value, next, atMs, now)) {
        reports += 1;
        value = next;
        atMs = now;
      }
    }
    expect(reports).toBeLessThan(20);
    expect(reports).toBeGreaterThan(5);
  });
});
