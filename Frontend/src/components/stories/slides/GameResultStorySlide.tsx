import { useTranslation } from 'react-i18next';
import { Trophy } from 'lucide-react';
import type { StorySegment } from '@/api/stories';
import { getStoryGameBackdropUrl } from '@/utils/storyGameBackdrop';
import { StoryResultSlideShell } from './StoryResultSlideShell';
import { GameResultStoryStatsRow } from './GameResultStoryStatsRow';
import { GameResultStoryMatchCard } from './GameResultStoryMatchCard';
import { GameResultStorySummary } from './GameResultStorySummary';
import { STORY_GLOSSY_CTA_CLASS } from '../storyGlossyControl';
import {
  STORY_GAME_RESULT_CTA_BOTTOM,
  STORY_GAME_RESULT_SCROLL_PAD,
} from '../viewer/storyViewerEngagementLayout';

type GameResultStorySlideProps = {
  segment: Extract<StorySegment, { sourceType: 'GAME_RESULT' }>;
  highlightPlayerId: string;
  onOpenGame: (gameId: string) => void;
};

export function GameResultStorySlide({
  segment,
  highlightPlayerId,
  onOpenGame,
}: GameResultStorySlideProps) {
  const { t } = useTranslation();
  const { game, result } = segment;
  const matches = result.matches ?? [];
  const resultSummaryText = game.telegramResultsSummary?.trim() || null;

  return (
    <StoryResultSlideShell entityType={game.entityType} backdropUrl={getStoryGameBackdropUrl(game)}>
      <div
        className="my-auto w-full max-h-full shrink-0 flex flex-col gap-3"
        style={{ paddingBottom: STORY_GAME_RESULT_SCROLL_PAD }}
      >
        <header className="shrink-0 text-center">
          <div
            className={`mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full ${
              result.isWinner
                ? 'bg-yellow-300/25 shadow-[0_0_24px_rgba(250,204,21,0.45)] ring-2 ring-yellow-200/70'
                : 'bg-white/15 ring-1 ring-white/30'
            }`}
          >
            <Trophy
              size={24}
              className={result.isWinner ? 'text-yellow-200' : 'text-white'}
              strokeWidth={1.75}
            />
          </div>

          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/80">
            {t('stories.gameResult')}
          </p>

          <h2 className="mt-1 text-lg font-bold leading-snug text-white drop-shadow-sm">
            {game.name || t('stories.unnamedGame')}
          </h2>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            {result.isWinner ? (
              <span className="rounded-full bg-yellow-300/25 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-yellow-100 ring-1 ring-yellow-200/50">
                {t('stories.winnerBadge')}
              </span>
            ) : null}
            {result.position != null ? (
              <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-white ring-1 ring-white/25">
                {t('stories.place', { position: result.position })}
              </span>
            ) : null}
          </div>
        </header>

        <GameResultStoryStatsRow result={result} />

        {matches.length > 0 || resultSummaryText ? (
          <div className="space-y-3 pr-0.5">
            {matches.length > 0 ? (
              <div>
                <p className="mb-2 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
                  {t('stories.matchBreakdown')}
                </p>
                <div className="space-y-2 pb-1">
                  {matches.map((match) => (
                    <GameResultStoryMatchCard
                      key={match.matchId}
                      match={match}
                      highlightPlayerId={highlightPlayerId}
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {resultSummaryText ? <GameResultStorySummary text={resultSummaryText} /> : null}
          </div>
        ) : null}
      </div>

      <div
        className="pointer-events-none absolute inset-x-3.5 z-20"
        style={{ bottom: STORY_GAME_RESULT_CTA_BOTTOM }}
      >
        <button
          type="button"
          data-story-interactive
          className={`pointer-events-auto ${STORY_GLOSSY_CTA_CLASS}`}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onOpenGame(game.id);
          }}
        >
          {t('stories.viewResults')}
        </button>
      </div>
    </StoryResultSlideShell>
  );
}
