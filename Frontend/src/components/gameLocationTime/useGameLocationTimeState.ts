import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Club, Court, EntityType, Game } from '@/types';
import type { CreateGameBookingFields } from '@shared/gameBooking/contracts';
import { applyCourtIdsToBookingSnapshots } from '@shared/gameBooking/applyCourtIdsToBookingSnapshots';
import { buildBookingSnapshots } from '@shared/gameBooking/buildBookingSnapshots';
import { computeBookingSelectionLimits } from '@shared/gameBooking/computeBookingSelectionLimits';
import { deriveGameTimeFromBookings } from '@shared/gameBooking/deriveGameTimeFromBookings';
import { courtHasActiveBookingIntegration } from '@/utils/clubBookingIntegration';
import { deriveLocationTimeMode } from './LocationTimeMode';
import {
  getManualClubBookingPreference,
  setManualClubBookingPreference,
} from './manualClubBookingPreference';

type UseGameLocationTimeStateArgs = {
  entityType: EntityType;
  panelMode: 'create' | 'edit';
  club: Club | undefined;
  courts: Court[];
  bookingMatchCourts?: Court[];
  liveApiEnabled: boolean;
  maxParticipants: number;
  playersPerMatch: number;
  selectedCourtIds: string[];
  selectedDate: Date;
  selectedTime: string;
  duration: number;
  hasBookedCourt: boolean;
  initialSelectedBookingIds?: string[];
  initialTimeOverride?: boolean;
  game?: Game;
  createDateFromSelection: () => { startTime: string; endTime: string };
};

export function useGameLocationTimeState({
  entityType: _entityType,
  panelMode: _panelMode,
  club,
  courts,
  bookingMatchCourts,
  liveApiEnabled: _liveApiEnabled,
  maxParticipants,
  playersPerMatch,
  selectedCourtIds,
  selectedDate,
  selectedTime,
  duration,
  hasBookedCourt,
  initialSelectedBookingIds = [],
  initialTimeOverride = false,
  game: _game,
  createDateFromSelection,
}: UseGameLocationTimeStateArgs) {
  const [selectedBookingIds, setSelectedBookingIds] = useState<string[]>(initialSelectedBookingIds);
  const [timeOverride, setTimeOverride] = useState(initialTimeOverride);
  const [overrideStartTime, setOverrideStartTime] = useState<string | undefined>();
  const [overrideEndTime, setOverrideEndTime] = useState<string | undefined>();
  const [skipRealCourtBooking, setSkipRealCourtBooking] = useState(false);
  const [initialBookingIds] = useState(initialSelectedBookingIds);
  const [initialCourtIds] = useState(selectedCourtIds);
  const [initialTime] = useState({ date: selectedDate, time: selectedTime, duration });

  const locationTimeMode = deriveLocationTimeMode(selectedBookingIds);

  const integratedCourtIds = useMemo(
    () =>
      selectedCourtIds.filter((id) => {
        const court = courts.find((c) => c.id === id);
        return courtHasActiveBookingIntegration(club, court);
      }),
    [selectedCourtIds, courts, club],
  );

  useEffect(() => {
    if (integratedCourtIds.length === 0) {
      setSkipRealCourtBooking(false);
      return;
    }
    setSkipRealCourtBooking(getManualClubBookingPreference(club?.id));
  }, [club?.id, integratedCourtIds.length]);

  const setSkipRealCourtBookingForClub = useCallback(
    (value: boolean) => {
      setSkipRealCourtBooking(value);
      setManualClubBookingPreference(club?.id, value);
    },
    [club?.id],
  );

  const willBookOnCreate =
    locationTimeMode === 'timeSlots' &&
    integratedCourtIds.length > 0 &&
    !skipRealCourtBooking;

  const bookingSelectionLimits = useMemo(
    () => computeBookingSelectionLimits(maxParticipants, playersPerMatch),
    [maxParticipants, playersPerMatch],
  );

  const dirtyFlags = useMemo(() => {
    const bookingsDirty =
      selectedBookingIds.length !== initialBookingIds.length ||
      selectedBookingIds.some((id, i) => id !== initialBookingIds[i]);
    const timeSlotsDirty =
      locationTimeMode === 'timeSlots' &&
      (selectedCourtIds.join(',') !== initialCourtIds.join(',') ||
        selectedTime !== initialTime.time ||
        duration !== initialTime.duration ||
        selectedDate.toDateString() !== initialTime.date.toDateString());
    return {
      bookings: bookingsDirty,
      timeSlots: timeSlotsDirty,
      snapshotsStale: false,
    };
  }, [
    selectedBookingIds,
    initialBookingIds,
    locationTimeMode,
    selectedCourtIds,
    initialCourtIds,
    selectedTime,
    duration,
    selectedDate,
    initialTime,
  ]);

  const buildCreatePayload = useCallback(
    (
      selectedBookings: Array<{
        uuid: string;
        bookingStart: string;
        bookingEnd: string;
        bookingResource?: { id?: string; bookingResourceId?: string; uuid?: string };
        bookingResourceId?: string;
      }>,
    ): CreateGameBookingFields & {
      courtIds?: string[];
      startTime: string;
      endTime: string;
      hasBookedCourt: boolean;
    } => {
      if (locationTimeMode === 'bookings' && selectedBookings.length > 0) {
        const clubTimezone = club?.city?.timezone ?? undefined;
        const matchCourts = bookingMatchCourts ?? courts;
        const snapshots = applyCourtIdsToBookingSnapshots(
          buildBookingSnapshots(selectedBookings, matchCourts, { timeZone: clubTimezone }),
          selectedCourtIds,
        );
        const derived = deriveGameTimeFromBookings(snapshots, { timeZone: clubTimezone });
        const slotTimes = timeOverride && overrideStartTime && overrideEndTime
          ? { startTime: overrideStartTime, endTime: overrideEndTime }
          : derived;
        const uniqueCourtIds = [
          ...new Set([
            ...snapshots.map((s) => s.courtId).filter(Boolean),
            ...selectedCourtIds,
          ]),
        ] as string[];
        return {
          externalBookingIds: selectedBookings.map((b) => b.uuid),
          externalBookingProvider: 'BOOKTIME',
          bookingSnapshots: snapshots,
          courtIds: uniqueCourtIds.length > 0 ? uniqueCourtIds : undefined,
          startTime: slotTimes.startTime ?? createDateFromSelection().startTime,
          endTime: slotTimes.endTime ?? createDateFromSelection().endTime,
          timeOverride,
          hasBookedCourt: true,
        };
      }

      const { startTime, endTime } = createDateFromSelection();
      return {
        startTime,
        endTime,
        hasBookedCourt: willBookOnCreate ? true : hasBookedCourt,
        courtIds:
          selectedCourtIds.length > 0 ? selectedCourtIds : undefined,
      };
    },
    [
      locationTimeMode,
      club,
      courts,
      bookingMatchCourts,
      selectedCourtIds,
      timeOverride,
      overrideStartTime,
      overrideEndTime,
      createDateFromSelection,
      willBookOnCreate,
      hasBookedCourt,
    ],
  );

  return {
    locationTimeMode,
    willBookOnCreate,
    skipRealCourtBooking,
    setSkipRealCourtBooking: setSkipRealCourtBookingForClub,
    selectedBookingIds,
    setSelectedBookingIds,
    timeOverride,
    setTimeOverride,
    overrideStartTime,
    overrideEndTime,
    setOverrideTimes: (start: string, end: string) => {
      setOverrideStartTime(start);
      setOverrideEndTime(end);
    },
    bookingSelectionLimits,
    integratedCourtIds,
    buildCreatePayload,
    dirtyFlags,
  };
}
