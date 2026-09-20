import type { StoryBubble, StorySegment } from '@/api/stories';
import { MediaStorySlide } from './slides/MediaStorySlide';
import { GamePromoStorySlide } from './slides/GamePromoStorySlide';
import { GameResultStorySlide } from './slides/GameResultStorySlide';
import { BracketChampionStorySlide } from './slides/BracketChampionStorySlide';
import { RecapStorySlide } from './slides/RecapStorySlide';

export type StoryViewerSlideHandlers = {
  open: boolean;
  openGame: (gameId: string) => void;
  openBracket: (path: string) => void;
  paused: boolean;
  replayGeneration: number;
  onVideoEnded: () => void;
  onVideoError: () => void;
  onVideoProgress: (progress: number) => void;
  onVideoDurationMs: (durationMs: number | null) => void;
};

export function buildStoryViewerSlide(
  segment: StorySegment,
  bubble: StoryBubble,
  handlers: StoryViewerSlideHandlers,
) {
  switch (segment.sourceType) {
    case 'GAME_CREATED':
      return <GamePromoStorySlide segment={segment} onOpenGame={handlers.openGame} />;
    case 'GAME_RESULT':
      return (
        <GameResultStorySlide
          segment={segment}
          highlightPlayerId={bubble.user.id}
          onOpenGame={handlers.openGame}
        />
      );
    case 'BRACKET_CHAMPION':
      return <BracketChampionStorySlide segment={segment} onOpenBracket={handlers.openBracket} />;
    // PRD 353 — the recap reel. `bubble.user.id` is the recap's owner, which is
    // also the viewer (a recap is only ever played by the person it is about),
    // so it doubles as the "me" side of the partner chemistry chip.
    case 'MONTHLY_RECAP':
      return <RecapStorySlide segment={segment} viewerId={bubble.user.id} />;
    case 'USER_STORY_ITEM':
    case 'GAME_PHOTO':
      return (
        <MediaStorySlide
          segment={segment}
          isActive={handlers.open}
          paused={handlers.paused}
          replayNonce={handlers.replayGeneration}
          onVideoEnded={handlers.onVideoEnded}
          onVideoError={handlers.onVideoError}
          onVideoProgress={handlers.onVideoProgress}
          onVideoDurationMs={handlers.onVideoDurationMs}
        />
      );
    default:
      return null;
  }
}
