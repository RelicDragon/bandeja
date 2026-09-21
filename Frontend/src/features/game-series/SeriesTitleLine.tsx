import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Repeat } from 'lucide-react';
import { isGameSeriesEnabled } from '@/config/featureFlags';
import { buildSeriesPath } from '@/deepLinks/catalog';
import type { Game } from '@/types';

/**
 * PRD 345 — the quiet "Part of *Tuesday Regulars* · week 12" line that sits
 * directly under the game title, linking to the series page.
 *
 * Reads `game.seriesLabel`, the same public label the Find card pill uses, so it
 * needs no request and renders for a **signed-out** viewer too — a newcomer
 * arriving on a shared link is exactly who the line is written for. The
 * roster-aware surfaces (the "same time next week?" card and the organizer
 * strip) stay in `SeriesGameSection`, which is authenticated.
 */
export interface SeriesTitleLineProps {
  game: Pick<Game, 'seriesLabel'>;
  className?: string;
}

export const SeriesTitleLine = ({ game, className = '' }: SeriesTitleLineProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const label = game.seriesLabel;
  if (!isGameSeriesEnabled() || !label) return null;

  return (
    <button
      type="button"
      onClick={() => navigate(buildSeriesPath(label.seriesId))}
      aria-label={t('series.openSeries')}
      className={`mb-2 inline-flex min-h-[44px] items-center gap-1.5 self-start rounded-lg px-1 text-start text-xs text-gray-500 underline-offset-2 hover:underline dark:text-gray-400 ${className}`.trim()}
    >
      <Repeat className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">
        {label.occurrenceNumber
          ? t('series.partOfWeek', { name: label.name, count: label.occurrenceNumber })
          : t('series.partOf', { name: label.name })}
      </span>
    </button>
  );
};
