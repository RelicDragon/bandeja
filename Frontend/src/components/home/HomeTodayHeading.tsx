import { useTranslation } from 'react-i18next';
import { Calendar } from 'lucide-react';

interface HomeTodayHeadingProps {
  /** Whether the month calendar is currently shown below this heading. */
  calendarVisible: boolean;
  /** Toggle the calendar's visibility. */
  onToggleCalendar: () => void;
}

/**
 * A compact "Today" section heading with a calendar icon-toggle. Replaces the
 * calendar tab that previously lived inside `MyTabPanelSwitcher`. The selected
 * date and its rendering are unchanged (see `CalendarSection`); this only
 * drives `calendarVisible`.
 */
export function HomeTodayHeading({ calendarVisible, onToggleCalendar }: HomeTodayHeadingProps) {
  const { t } = useTranslation();

  return (
    <div className="mb-2 mt-4 flex items-center justify-between px-1">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t('home.today', { defaultValue: t('games.calendar') })}
      </h2>
      <button
        type="button"
        onClick={onToggleCalendar}
        aria-pressed={calendarVisible}
        aria-label={t('games.calendar')}
        data-testid="my-tab-calendar-toggle"
        className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
          calendarVisible
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-card text-muted-foreground hover:bg-muted'
        }`}
      >
        <Calendar className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  );
}
