import type { StorySourceType } from '@/api/stories';

export type StoryViewerSlideKind =
  | 'GAME_CREATED'
  | 'GAME_RESULT'
  | 'BRACKET_CHAMPION'
  | 'MEDIA'
  | null;

export function resolveStoryViewerSlideKind(sourceType: StorySourceType | string): StoryViewerSlideKind {
  switch (sourceType) {
    case 'GAME_CREATED':
      return 'GAME_CREATED';
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
