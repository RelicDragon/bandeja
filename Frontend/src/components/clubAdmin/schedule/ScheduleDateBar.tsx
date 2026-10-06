/**
 * Date bar: previous / date (native picker) / next, a Today shortcut when away from the club's
 * today, Day | Week view, and the court picker in week view. Horizontal swipes step days.
 */
import { useRef, type ReactNode } from 'react';
import { useDaySwipe } from './useDaySwipe';
import { useTranslation } from 'react-i18next';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { addDaysToDate, isClubDate } from '@shared/clubAdmin/clubTime';
import { SegmentedControl } from '../console/controls';
import type { ConsoleFormat } from '../console/format';
import { cx, iconButtonClass } from '../console/classes';

export type ScheduleView = 'day' | 'week';

export function ScheduleDateBar({
  date,
  today,
  view,
  fmt,
  onDate,
  onView,
  trailing,
}: {
  date: string;
  today: string;
  view: ScheduleView;
  fmt: ConsoleFormat;
  onDate: (date: string) => void;
  onView: (view: ScheduleView) => void;
  trailing?: ReactNode;
}) {
  const { t } = useTranslation('clubAdmin');
  const inputRef = useRef<HTMLInputElement>(null);
  const step = view === 'week' ? 7 : 1;
  const swipe = useDaySwipe((d) => onDate(addDaysToDate(date, d * step)));
  const weekEnd = addDaysToDate(date, 6);
  const label = view === 'week' ? `${fmt.dateMedium(date)} – ${fmt.dateMedium(weekEnd)}` : fmt.dateMedium(date);
  const relative =
    view === 'week'
      ? null
      : date === today
        ? t('common.today')
        : date === addDaysToDate(today, 1)
          ? t('common.tomorrow')
          : date === addDaysToDate(today, -1)
            ? t('common.yesterday')
            : null;

  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border bg-ca-surface px-2 py-2 lg:px-4" {...swipe}>
      <div className="flex min-w-[13rem] flex-1 items-center gap-0.5">
        <button
          type="button"
          className={iconButtonClass}
          onClick={() => onDate(addDaysToDate(date, -step))}
          aria-label={view === 'week' ? t('schedule.prevWeek') : t('schedule.prevDay')}
        >
          <ChevronLeft className="h-5 w-5 rtl:-scale-x-100" aria-hidden />
        </button>
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <button
            type="button"
            onClick={openPicker}
            className="flex w-full min-w-0 items-center justify-center gap-1.5 rounded-lg px-1.5 py-1 text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 lg:justify-start"
            aria-label={t('schedule.pickDate', { date: fmt.dateLong(date) })}
          >
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex min-w-0 flex-col items-start leading-tight">
              {relative ? <span className="text-[11px] font-medium text-muted-foreground">{relative}</span> : null}
              <span className="max-w-full truncate text-[15px] font-semibold tabular-nums">{label}</span>
            </span>
          </button>
          <input
            ref={inputRef}
            type="date"
            tabIndex={-1}
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-0"
            value={date}
            onChange={(e) => {
              if (isClubDate(e.target.value)) onDate(e.target.value);
            }}
          />
        </div>
        <button
          type="button"
          className={iconButtonClass}
          onClick={() => onDate(addDaysToDate(date, step))}
          aria-label={view === 'week' ? t('schedule.nextWeek') : t('schedule.nextDay')}
        >
          <ChevronRight className="h-5 w-5 rtl:-scale-x-100" aria-hidden />
        </button>
      </div>
      <div className="ms-auto flex shrink-0 items-center gap-2">
        {date !== today ? (
          <button
            type="button"
            onClick={() => onDate(today)}
            className={cx(
              'h-8 shrink-0 rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500'
            )}
          >
            {t('common.today')}
          </button>
        ) : null}
        {trailing}
        <SegmentedControl<ScheduleView>
          size="sm"
          ariaLabel={t('schedule.viewLabel')}
          value={view}
          onChange={onView}
          options={[
            { value: 'day', label: t('schedule.view.day') },
            { value: 'week', label: t('schedule.view.week') },
          ]}
        />
      </div>
    </div>
  );
}
