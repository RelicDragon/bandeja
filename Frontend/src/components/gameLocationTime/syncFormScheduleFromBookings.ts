import type { Club, Court } from '@/types';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { buildBookingSnapshots } from '@shared/gameBooking/buildBookingSnapshots';
import { deriveGameTimeFromBookings } from '@shared/gameBooking/deriveGameTimeFromBookings';
import { formatTimeInClubTimezone } from '@/hooks/useGameTimeDuration';

export type FormScheduleFromBookings = {
  selectedDate: Date;
  selectedTime: string;
  durationHours: number;
  courtIds: string[];
};

export function syncFormScheduleFromBookings(input: {
  selectedBookings: BooktimeBookingRecord[];
  courts: Court[];
  club: Club | undefined;
  timeOverride: boolean;
  overrideStartTime?: string;
  overrideEndTime?: string;
}): FormScheduleFromBookings | null {
  if (input.selectedBookings.length === 0 || !input.club) return null;

  const snapshots = buildBookingSnapshots(input.selectedBookings, input.courts, {
    timeZone: input.club.city?.timezone ?? undefined,
  });
  const derived = deriveGameTimeFromBookings(snapshots, {
    timeZone: input.club.city?.timezone ?? undefined,
  });

  const startIso =
    input.timeOverride && input.overrideStartTime
      ? input.overrideStartTime
      : derived.startTime;
  const endIso =
    input.timeOverride && input.overrideEndTime ? input.overrideEndTime : derived.endTime;

  if (!startIso || !endIso) return null;

  const startDate = new Date(startIso);
  const endDate = new Date(endIso);
  const durationHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
  if (durationHours <= 0) return null;

  const courtIds = [
    ...new Set(snapshots.map((s) => s.courtId).filter((id): id is string => Boolean(id))),
  ];

  return {
    selectedDate: startDate,
    selectedTime: formatTimeInClubTimezone(startDate, input.club),
    durationHours,
    courtIds,
  };
}
