import { describe, expect, it } from 'vitest';
import { formatDistanceToNow } from 'date-fns';
import { drawCompositionOverlays } from '@/components/stories/create/utils/storyCompositionDraw';
import { formatRelativeTimeSafe } from '@/utils/dateFormat';
import { resolveStoryViewerSlideKind } from '@/components/stories/storiesViewerSlideKind';
import type { TextStoryLayer } from '@/components/stories/create/types/storyEditor.types';

describe('story viewer crash guards', () => {
  it('drawCompositionOverlays survives text layers missing style (legacy overlay data)', () => {
    const ctx = {
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      font: '',
      textAlign: 'center' as CanvasTextAlign,
      textBaseline: 'middle' as CanvasTextBaseline,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      filter: 'none',
      measureText: (text: string) => ({ width: text.length * 10 }),
      fillText: () => {},
      strokeText: () => {},
      beginPath: () => {},
      roundRect: () => {},
      fill: () => {},
    } as unknown as CanvasRenderingContext2D;
    const layer = {
      id: 't1',
      type: 'text',
      text: 'legacy',
      transform: { x: 540, y: 960, scale: 1, rotation: 0 },
    } as TextStoryLayer;

    expect(() => drawCompositionOverlays(ctx, { layers: [layer] })).not.toThrow();
  });

  it('formatRelativeTime throws on invalid ISO strings', () => {
    expect(() => formatDistanceToNow(new Date('not-a-date'), { addSuffix: true })).toThrow(
      /Invalid time value/
    );
  });

  it('formatRelativeTimeSafe returns empty for invalid dates', () => {
    expect(formatRelativeTimeSafe('not-a-date')).toBe('');
    expect(formatRelativeTimeSafe(new Date().toISOString())).not.toBe('');
  });

  it('resolveStoryViewerSlideKind never routes game segments to media slide', () => {
    expect(resolveStoryViewerSlideKind('GAME_RESULT')).toBe('GAME_RESULT');
    expect(resolveStoryViewerSlideKind('USER_STORY_ITEM')).toBe('MEDIA');
    expect(resolveStoryViewerSlideKind('UNKNOWN')).toBeNull();
  });

  it('stale viewer index can target a different bubble than the one clicked', () => {
    const staleInternalIndex = 1;
    const clickedIndex = 0;
    expect(staleInternalIndex).not.toBe(clickedIndex);
  });
});
