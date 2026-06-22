import { MonthCalendar, type MonthCalendarProps } from '@/components/MonthCalendar';
import { SelectedDateHeading } from '@/components/SelectedDateHeading';

export function CalendarSection({ selectedDate, collapsed, upcomingsToggle, ...calendarProps }: MonthCalendarProps) {
  return (
    <>
      <MonthCalendar
        selectedDate={selectedDate}
        collapsed={collapsed}
        upcomingsToggle={upcomingsToggle}
        {...calendarProps}
      />
      {!collapsed && <SelectedDateHeading date={selectedDate} />}
    </>
  );
}
