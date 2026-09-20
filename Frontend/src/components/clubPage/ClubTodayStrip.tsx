import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatOpeningHour, relativeUpdatedPhrase } from './clubTodayStripFormat';
import { Home, Sun } from 'lucide-react';
import type { ClubTodayAvailability, ClubTodayCourt } from '@/api/clubPublic';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';

type ClubTodayStripProps = {
  availability: ClubTodayAvailability;
  onSelectCourt: (courtId: string, date: string) => void;
};

function CourtChip({
  court,
  totalHours,
  onSelect,
}: {
  court: ClubTodayCourt;
  totalHours: number;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const label = t('clubPage.today.courtLabel', {
    court: court.name,
    free: court.freeHours,
    total: totalHours,
  });

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={label}
      className="flex min-h-[44px] w-36 shrink-0 snap-start flex-col gap-2 rounded-2xl border border-gray-200/90 bg-white p-3 text-start transition-colors hover:border-primary-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:border-gray-700 dark:bg-gray-900"
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-900 dark:text-white">
        {court.isIndoor ? (
          <Home size={12} className="shrink-0 text-gray-400" aria-hidden />
        ) : (
          <Sun size={12} className="shrink-0 text-gray-400" aria-hidden />
        )}
        <span className="truncate">{court.name}</span>
      </span>
      <span className="flex h-2 gap-px overflow-hidden rounded-full" aria-hidden>
        {court.hours.map((hour) => (
          <span
            key={hour.hour}
            className={`h-full flex-1 ${
              hour.busy ? 'bg-gray-300 dark:bg-gray-700' : 'bg-emerald-500/80 dark:bg-emerald-400/80'
            }`}
          />
        ))}
      </span>
      <span className="text-[11px] text-gray-500 dark:text-gray-400">
        {t('clubPage.today.freeHours', { count: court.freeHours })}
      </span>
    </button>
  );
}

/**
 * PRD 354 — "Today at a glance".
 *
 * Read-only decoration derived from the stored occupancy snapshot. It never
 * blocks the page: the caller renders it only once the query resolves, and a
 * club with no courts or no snapshot simply has no strip.
 */
export function ClubTodayStrip({ availability, onSelectCourt }: ClubTodayStripProps) {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const totalHours = availability.closeHour - availability.openHour;
  const relative = useMemo(
    () => relativeUpdatedPhrase(availability.updatedAt, i18n.language),
    [availability.updatedAt, i18n.language],
  );
  // The window is two clock times, so it follows the viewer's 12/24-hour
  // preference like every other time in the app — the copy carries no format.
  const display = useMemo(() => resolveDisplaySettings(user), [user]);
  const windowHint = t('clubPage.today.windowHint', {
    open: formatOpeningHour(availability.openHour, display.locale, display.hour12),
    close: formatOpeningHour(availability.closeHour, display.locale, display.hour12),
  });
  const updatedLabel =
    relative == null
      ? null
      : relative === ''
        ? t('clubPage.today.updatedJustNow')
        : t('clubPage.today.updated', { relative });

  if (availability.courts.length === 0 || totalHours <= 0) return null;

  return (
    <div className="space-y-2">
      <ul className="-mx-2 flex snap-x gap-2 overflow-x-auto px-2 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {availability.courts.map((court) => (
          <li key={court.courtId} className="flex shrink-0">
            <CourtChip
              court={court}
              totalHours={totalHours}
              onSelect={() => onSelectCourt(court.courtId, availability.date)}
            />
          </li>
        ))}
      </ul>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1">
          <span className="h-2 w-4 rounded-full bg-emerald-500/80 dark:bg-emerald-400/80" aria-hidden />
          {t('clubPage.today.legendFree')}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-4 rounded-full bg-gray-300 dark:bg-gray-700" aria-hidden />
          {t('clubPage.today.legendBusy')}
        </span>
        <span>{windowHint}</span>
        {updatedLabel ? <span>{updatedLabel}</span> : null}
      </p>
    </div>
  );
}
