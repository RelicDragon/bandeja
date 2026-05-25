import type { StorySegment } from '@/api/stories';

export type StoryEngagementLayoutVariant = 'media' | 'gamePromo' | 'gameResult' | 'bracketChampion';

/** Min height of bottom stack (DM row + safe area), without caption */
export const STORY_VIEWER_BOTTOM_BAR_OFFSET =
  'calc(4.25rem + max(0.5rem, env(safe-area-inset-bottom, 0px)))';

/** Caption (up to ~2 lines) sitting above the DM row in the bottom stack */
export const STORY_VIEWER_CAPTION_ABOVE_BAR = '2.75rem';

/** Game-result CTA sits above caption + bottom stack */
export const STORY_GAME_RESULT_CTA_BOTTOM = `calc(4.25rem + ${STORY_VIEWER_CAPTION_ABOVE_BAR} + 0.75rem + max(0.5rem, env(safe-area-inset-bottom, 0px)))`;

export const STORY_GAME_RESULT_SCROLL_PAD = `calc(4.25rem + ${STORY_VIEWER_CAPTION_ABOVE_BAR} + 3.75rem + max(0.75rem, env(safe-area-inset-bottom, 0px)))`;

export function storyEngagementLayoutVariant(segment: StorySegment): StoryEngagementLayoutVariant {
  if (segment.sourceType === 'GAME_CREATED') return 'gamePromo';
  if (segment.sourceType === 'GAME_RESULT') return 'gameResult';
  if (segment.sourceType === 'BRACKET_CHAMPION') return 'bracketChampion';
  return 'media';
}

/** Absolute caption placement when there is no bottom DM bar (own story) */
export function storyEngagementCaptionClass(variant: StoryEngagementLayoutVariant): string {
  const base = 'absolute z-40 left-3 max-w-[calc(100%-1.5rem)]';
  switch (variant) {
    case 'gamePromo':
      return `${base} bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))]`;
    case 'gameResult':
    case 'bracketChampion':
      return `${base} bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))]`;
    default:
      return `${base} bottom-[max(1rem,env(safe-area-inset-bottom,0px))]`;
  }
}
