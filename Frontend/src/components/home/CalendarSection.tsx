import { MonthCalendar, type MonthCalendarProps } from '@/components/MonthCalendar';
import { SelectedDateWeatherCard } from '@/components/home/SelectedDateWeatherCard';
import { SelectedDateAdMessages } from '@/components/home/SelectedDateAdMessages';

export function CalendarSection({
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
}
