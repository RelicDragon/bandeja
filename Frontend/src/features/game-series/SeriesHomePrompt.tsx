import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { isGameSeriesEnabled } from '@/config/featureFlags';
import type { Game } from '@/types';
import { SeriesNextWeekCard } from './SeriesNextWeekCard';
import { useSeriesGameContext } from './useSeries';

/**
 * PRD 345 — the "Same time next week?" card on Home's My Games section.
 *
 * Exactly one card: the most recently finished occurrence the viewer has not
 * answered for. More than one would turn Home into a queue of prompts, and the
 * PRD asks for a moment, not a backlog. Renders nothing when the flag is off,
 * when no finished occurrence belongs to a series, or when the viewer already
 * holds a seat next week.
 */

export interface SeriesHomePromptProps {
  /** The finished games already computed by `MyGamesSection`. */
  finishedGames: Game[];
  className?: string;
}

export const SeriesHomePrompt = ({ finishedGames, className = '' }: SeriesHomePromptProps) => {
  const navigate = useNavigate();

  const candidate = useMemo(
    () => finishedGames.find((game) => Boolean(game.seriesId ?? game.seriesLabel)) ?? null,
    [finishedGames],
  );

  const { data: context } = useSeriesGameContext(candidate?.id, isGameSeriesEnabled());

  if (!isGameSeriesEnabled() || !candidate || !context?.next) return null;

  const { next } = context;
  if (!next.viewerIsRegular || next.viewerIsPlaying) return null;

  return (
    <SeriesNextWeekCard
      className={className}
      prompt={next}
      sourceGameId={candidate.id}
      clubName={candidate.club?.name ?? null}
      clubAvatarUrl={candidate.club?.avatar ?? null}
      onOpenSeries={(seriesId) => navigate(`/series/${seriesId}`)}
    />
  );
};
