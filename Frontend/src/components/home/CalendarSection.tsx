import { MonthCalendar, type MonthCalendarProps } from '@/components/MonthCalendar';
import { SelectedDateHeading } from '@/components/SelectedDateHeading';
import { CalendarDayWeatherRow } from '@/components/home/CalendarDayWeatherRow';

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
      {!collapsed && (
        <>
          <SelectedDateHeading date={selectedDate} hint={selectedDateEmptyHint} />
          <CalendarDayWeatherRow selectedDate={selectedDate} />
        </>
      )}
    </>
  );
}
