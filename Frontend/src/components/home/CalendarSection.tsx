import { memo } from 'react';
import { MonthCalendar, type MonthCalendarProps } from '@/components/MonthCalendar';
import { SelectedDateWeatherCard } from '@/components/home/SelectedDateWeatherCard';
import { SelectedDateAdMessages } from '@/components/home/SelectedDateAdMessages';

// Both hosts hand this a memoised props object, so `memo` lets the weather
// card and ad messages skip the host's unrelated renders, not just the grid.
export const CalendarSection = memo(function CalendarSection({
  selectedDate,
  collapsed,
  upcomingsToggle,
  selectedDateEmptyHint,
  ...calendarProps
}: MonthCalendarProps & { selectedDateEmptyHint?: string }) {
  return (
    <>
      <MonthCalendar
        selectedDate={selectedDate}
        collapsed={collapsed}
        upcomingsToggle={upcomingsToggle}
        {...calendarProps}
      />
      {!collapsed ? (
        <>
          <SelectedDateWeatherCard date={selectedDate} hint={selectedDateEmptyHint} />
          <SelectedDateAdMessages date={selectedDate} />
        </>
      ) : null}
    </>
  );
});
