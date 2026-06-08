import { describe, expect, it } from 'vitest';
import { resolveStoryVideoProgressFill } from './useStoriesPlayback';

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
