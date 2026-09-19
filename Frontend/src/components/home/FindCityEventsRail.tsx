import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import type { Game } from '@/types';
import { findCityEventsRailLayout } from '@/utils/findCityEventsRailLayout';
import { EventPosterCard } from './EventPosterCard';

const RAIL_LIMIT = 3;

function FindCityEventsRailView({
  events,
  onSeeAll,
}: {
  events: Game[];
  onSeeAll: () => void;
}) {
  const { t } = useTranslation();
  const visible = events.slice(0, RAIL_LIMIT);
  const layout = findCityEventsRailLayout(visible.length);

  if (visible.length === 0) return null;

  return (
    <section
      className="mb-3 rounded-2xl border border-gray-200/70 bg-white px-2.5 py-2.5 dark:border-gray-800 dark:bg-gray-900"
      data-testid="find-city-events-rail"
      data-layout={layout}
      aria-label={t('games.upcomingEvents', { defaultValue: 'Events' })}
    >
      <div className="mb-2 flex items-center justify-between gap-3 px-0.5">
        <h2 className="text-sm font-medium text-gray-600 dark:text-gray-300">
          {t('games.upcomingEvents', { defaultValue: 'Events' })}
        </h2>
        <button
          type="button"
          data-testid="find-city-events-see-all"
          onClick={onSeeAll}
          className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400"
        >
          {t('games.seeAllEvents', { defaultValue: 'See all' })}
          <ChevronRight size={14} className="shrink-0" aria-hidden />
        </button>
      </div>
      {layout === 'row' ? (
        <EventPosterCard game={visible[0]} variant="list" />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visible.map((game) => (
            <EventPosterCard key={game.id} game={game} />
          ))}
        </div>
      )}
    </section>
  );
}

export const FindCityEventsRail = memo(FindCityEventsRailView);
