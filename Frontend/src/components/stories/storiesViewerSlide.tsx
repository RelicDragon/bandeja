import type { StoryBubble, StorySegment } from '@/api/stories';
import { resolveStoryViewerSlideKind } from './storiesViewerSlideKind';
import { MediaStorySlide } from './slides/MediaStorySlide';
import { GamePromoStorySlide } from './slides/GamePromoStorySlide';
import { GameResultStorySlide } from './slides/GameResultStorySlide';
import { BracketChampionStorySlide } from './slides/BracketChampionStorySlide';

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
  const kind = resolveStoryViewerSlideKind(segment.sourceType);
  if (kind === 'GAME_CREATED') {
    return <GamePromoStorySlide segment={segment} onOpenGame={handlers.openGame} />;
  }
  if (kind === 'GAME_RESULT') {
    return (
      <GameResultStorySlide
        segment={segment}
        highlightPlayerId={bubble.user.id}
        onOpenGame={handlers.openGame}
      />
    );
  }
  if (kind === 'BRACKET_CHAMPION') {
    return <BracketChampionStorySlide segment={segment} onOpenBracket={handlers.openBracket} />;
  }
  if (kind === 'MEDIA') {
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
  }
  return null;
}
