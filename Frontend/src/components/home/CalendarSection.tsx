import { MonthCalendar, type MonthCalendarProps } from '@/components/MonthCalendar';
import { SelectedDateWeatherCard } from '@/components/home/SelectedDateWeatherCard';

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
        <SelectedDateWeatherCard date={selectedDate} hint={selectedDateEmptyHint} />
      ) : null}
    </>
  );
}
