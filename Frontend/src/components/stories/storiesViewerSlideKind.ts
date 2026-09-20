import type { StorySourceType } from '@/api/stories';

export type StoryViewerSlideKind =
  | 'GAME_CREATED'
  | 'GAME_RESULT'
  | 'BRACKET_CHAMPION'
  | 'MONTHLY_RECAP'
  | 'MEDIA'
  | null;

export function resolveStoryViewerSlideKind(sourceType: StorySourceType | string): StoryViewerSlideKind {
  switch (sourceType) {
    case 'GAME_CREATED':
      return 'GAME_CREATED';
    // PRD 353 — the recap reel; rendered from the payload, not from media.
    case 'MONTHLY_RECAP':
      return 'MONTHLY_RECAP';
    case 'GAME_RESULT':
      return 'GAME_RESULT';
    case 'BRACKET_CHAMPION':
      return 'BRACKET_CHAMPION';
    case 'USER_STORY_ITEM':
    case 'GAME_PHOTO':
      return 'MEDIA';
    default:
      return null;
  }
}
