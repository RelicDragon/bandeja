import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar } from 'lucide-react';
import { formatSearchResultDate } from '@/utils/dateFormat';

interface HomeTodayHeadingProps {
  /** Selected day for the games list below (calendar is collapsed). */
  selectedDate: Date | null;
  /** Expand the month calendar. */
  onShowCalendar: () => void;
}

/**
 * Day-list heading when My-tab calendar is collapsed. When the calendar is
 * open, the day is labeled by `SelectedDateWeatherCard` instead.
 */
export function HomeTodayHeading({ selectedDate, onShowCalendar }: HomeTodayHeadingProps) {
  const { t } = useTranslation();

  const title = useMemo(() => {
    if (!selectedDate) return t('home.today', { defaultValue: t('games.calendar') });
    return formatSearchResultDate(selectedDate, t);
  }, [selectedDate, t]);

  return (
    <div className="mb-2 mt-4 flex items-center justify-between px-1">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <button
        type="button"
        onClick={onShowCalendar}
        aria-pressed={false}
        aria-label={t('games.calendar')}
        data-testid="my-tab-calendar-toggle"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted"
      >
        <Calendar className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  );
}
