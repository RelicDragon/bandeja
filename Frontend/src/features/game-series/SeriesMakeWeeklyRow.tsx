import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Repeat } from 'lucide-react';
import { isGameSeriesEnabled } from '@/config/featureFlags';
import { canMutateGameRoster } from '@shared/gameMutationLock';
import type { Game } from '@/types';
import { SeriesRepeatSheet } from './SeriesRepeatSheet';
import { useMySeries } from './useSeries';
import { isoWeekdayInTimeZone, localTimeInTimeZone } from './seriesFormat';

/**
 * PRD 345 — "Make this a weekly game" in game settings.
 *
 * Owner-visible, one-off games only, and only while the game is still mutable
 * (`resultsStatus === 'NONE'`, via `canMutateGameRoster` — never `Game.status`,
 * per docs/product/constraints.md). Opens the same Repeat sheet the organizer
 * uses to edit a series, prefilled from this game.
 */

export interface SeriesMakeWeeklyRowProps {
  game: Game;
  /** Owner/admin gate the caller already computed. */
  canEdit: boolean;
}

export const SeriesMakeWeeklyRow = ({ game, canEdit }: SeriesMakeWeeklyRowProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const eligible =
    isGameSeriesEnabled() &&
    canEdit &&
    !game.seriesId &&
    Boolean(game.startTime) &&
    canMutateGameRoster(game);

  const { data: mySeries } = useMySeries(eligible);

  const timezone = game.city?.timezone ?? null;

  const regulars = useMemo(
    () =>
      (game.participants ?? [])
        .filter((participant) => participant.status === 'PLAYING' && participant.user)
        .map((participant) => ({
          userId: participant.userId,
          name: [participant.user?.firstName, participant.user?.lastName]
            .filter(Boolean)
            .join(' ')
            .trim(),
          avatar: participant.user?.avatar ?? null,
        })),
    [game.participants],
  );

  if (!eligible) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[44px] w-full items-center gap-3 rounded-xl bg-gray-50 px-3 py-2 text-start transition-colors hover:bg-gray-100 dark:bg-gray-800/60 dark:hover:bg-gray-700/60"
      >
        <Repeat className="h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">
            {t('series.makeWeekly')}
          </span>
          <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
            {t('series.makeWeeklyDescription')}
          </span>
        </span>
      </button>

      <SeriesRepeatSheet
        open={open}
        onClose={() => setOpen(false)}
        mode="create"
        gameId={game.id}
        initial={{
          cadence: 'WEEKLY',
          weekday: isoWeekdayInTimeZone(game.startTime, timezone),
          startTimeLocal: localTimeInTimeZone(game.startTime, timezone),
          endsOn: null,
          seatDeadlineHours: 48,
          horizonDays: 14,
        }}
        regulars={regulars}
        activeSeriesCount={mySeries?.activeCount}
        maxActiveSeries={mySeries?.maxActive}
        onManageSeries={() => navigate('/profile')}
        onSaved={(seriesId) => navigate(`/series/${seriesId}`)}
      />
    </>
  );
};
