import type { Club } from '@/types';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { formatTimeInClubTimezone } from '@/hooks/useGameTimeDuration';
import { formatClubDateKey } from '@/integrations/booktime/slots';

/** A draft selection only. The owning form performs booking/linking when saved. */
export type ClubScheduleSelection = {
  club: Club;
  courtId: string;
  startTime: string;
  endTime: string;
  booking?: BooktimeBookingRecord;
};

export type ClubSchedulePicker = {
  selectedDate: Date;
  onSelect: (selection: ClubScheduleSelection) => void;
  allowBookingLink?: boolean;
};

export function scheduleSelectionToForm(selection: ClubScheduleSelection) {
  const start = new Date(selection.startTime);
  const end = new Date(selection.endTime);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    throw new Error('Invalid club schedule selection');
  }
  // Forms store the calendar day in device-local Date fields, and the clock
  // time separately in the club timezone. Do not use the instant as the day.
  const [year, month, day] = formatClubDateKey(start, selection.club).split('-').map(Number);
  return {
    selectedDate: new Date(year, month - 1, day, 12),
    selectedTime: formatTimeInClubTimezone(start, selection.club),
    durationHours: (end.getTime() - start.getTime()) / 3_600_000,
    courtIds: [selection.courtId],
  };
}
