import { MonthCalendar, type MonthCalendarProps } from '@/components/MonthCalendar';
import { SelectedDateHeading } from '@/components/SelectedDateHeading';

export function CalendarSection({ selectedDate, ...calendarProps }: MonthCalendarProps) {
  return (
    <>
      <MonthCalendar selectedDate={selectedDate} {...calendarProps} />
      <SelectedDateHeading date={selectedDate} />
    </>
  );
}
