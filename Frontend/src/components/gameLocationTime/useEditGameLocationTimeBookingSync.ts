import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Club, Court } from '@/types';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import {
  areBookingRecordsEqual,
  areStringArraysEqual,
} from '@/components/gameLocationTime/locationTimeDraft';
import { syncFormScheduleFromBookings } from '@/components/gameLocationTime/syncFormScheduleFromBookings';
import { usePreselectedBookingHydration } from '@/hooks/createGameBookingFlow/usePreselectedBookingHydration';
import type { LocationTimeMode } from './LocationTimeMode';

type UseEditGameLocationTimeBookingSyncArgs = {
  club: Club | undefined;
  courts: Court[];
  bookingMatchCourts?: Court[];
  companyId?: string | null;
  clubBookingFlowActive?: boolean;
  initialLinkedBookingIds: string[];
  locationTimeMode: LocationTimeMode;
  selectedBookingIds: string[];
  setSelectedBookingIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  initialSelectedBookingRecords: BooktimeBookingRecord[];
  timeOverride: boolean;
  setTimeOverride: (value: boolean) => void;
  overrideStartTime?: string;
  overrideEndTime?: string;
  onScheduleSync: (schedule: {
    selectedDate: Date;
    selectedTime: string;
    durationHours: number;
    courtIds: string[];
  }) => void;
  resetBookingSelection: () => void;
  selectedClubId: string;
  initialClubId: string;
};

export function useEditGameLocationTimeBookingSync({
  club,
  courts,
  bookingMatchCourts,
  companyId,
  clubBookingFlowActive = false,
  initialLinkedBookingIds,
  locationTimeMode,
  selectedBookingIds,
  setSelectedBookingIds,
  initialSelectedBookingRecords,
  timeOverride,
  setTimeOverride,
  overrideStartTime,
  overrideEndTime,
  onScheduleSync,
  resetBookingSelection,
  selectedClubId,
  initialClubId,
}: UseEditGameLocationTimeBookingSyncArgs) {
  const shouldHydrateLinkedBookings =
    clubBookingFlowActive && initialLinkedBookingIds.length > 0;

  const [selectedBookingRecords, setSelectedBookingRecords] = useState<BooktimeBookingRecord[]>(
    () => (shouldHydrateLinkedBookings ? [] : initialSelectedBookingRecords),
  );
  const [derivedBookingSummary, setDerivedBookingSummary] = useState<{
    startTime: string | null;
    endTime: string | null;
    count: number;
  }>({
    startTime: null,
    endTime: null,
    count: initialLinkedBookingIds.length,
  });

  const prevClubRef = useRef(selectedClubId);
  useEffect(() => {
    if (prevClubRef.current === selectedClubId) return;
    prevClubRef.current = selectedClubId;
    if (selectedClubId !== initialClubId) {
      resetBookingSelection();
      setSelectedBookingIds([]);
      setSelectedBookingRecords([]);
      setDerivedBookingSummary({ startTime: null, endTime: null, count: 0 });
    }
  }, [selectedClubId, initialClubId, resetBookingSelection, setSelectedBookingIds]);

  const handleSelectedBookingIdsChange = useCallback(
    (ids: string[], records: BooktimeBookingRecord[] = []) => {
      setSelectedBookingIds((prev) => (areStringArraysEqual(prev, ids) ? prev : ids));
      setSelectedBookingRecords((prev) => (areBookingRecordsEqual(prev, records) ? prev : records));
      setDerivedBookingSummary((prev) => (prev.count === ids.length ? prev : { ...prev, count: ids.length }));
    },
    [setSelectedBookingIds],
  );

  const matchCourts = bookingMatchCourts ?? courts;
  const { hydrating: linkedBookingsHydrating } = usePreselectedBookingHydration({
    initialBookingIds: initialLinkedBookingIds,
    selectedBookingIds,
    selectedBookingRecords,
    club,
    companyId: companyId ?? undefined,
    matchCourts,
    enabled: clubBookingFlowActive && initialLinkedBookingIds.length > 0,
    onHydrated: handleSelectedBookingIdsChange,
  });

  const handleDerivedTimeChange = useCallback((start: string | null, end: string | null) => {
    setDerivedBookingSummary((prev) => {
      if (prev.startTime === start && prev.endTime === end) return prev;
      return { startTime: start, endTime: end, count: prev.count };
    });
  }, []);

  const lastSyncedScheduleKeyRef = useRef('');
  useEffect(() => {
    if (selectedBookingIds.length === 0) {
      if (timeOverride) {
        setTimeOverride(false);
      }
      lastSyncedScheduleKeyRef.current = '';
      return;
    }
    if (locationTimeMode !== 'bookings' || selectedBookingRecords.length === 0) {
      lastSyncedScheduleKeyRef.current = '';
      return;
    }

    const matchCourts = bookingMatchCourts ?? courts;
    const schedule = syncFormScheduleFromBookings({
      selectedBookings: selectedBookingRecords,
      courts: matchCourts,
      club,
      timeOverride,
      overrideStartTime,
      overrideEndTime,
    });
    if (!schedule) return;

    const syncKey = [
      selectedBookingIds.join(','),
      schedule.selectedTime,
      schedule.durationHours,
      schedule.courtIds.join(','),
      timeOverride,
      overrideStartTime,
      overrideEndTime,
    ].join('|');
    if (lastSyncedScheduleKeyRef.current === syncKey) return;
    lastSyncedScheduleKeyRef.current = syncKey;

    onScheduleSync(schedule);
  }, [
    locationTimeMode,
    selectedBookingRecords,
    selectedBookingIds,
    bookingMatchCourts,
    courts,
    club,
    timeOverride,
    overrideStartTime,
    overrideEndTime,
    onScheduleSync,
    setTimeOverride,
  ]);

  const effectiveDerivedSummary = useMemo(() => {
    if (
      timeOverride &&
      overrideStartTime &&
      overrideEndTime &&
      derivedBookingSummary.count > 0
    ) {
      return {
        ...derivedBookingSummary,
        startTime: overrideStartTime,
        endTime: overrideEndTime,
      };
    }
    return derivedBookingSummary;
  }, [timeOverride, overrideStartTime, overrideEndTime, derivedBookingSummary]);

  return {
    selectedBookingRecords,
    handleSelectedBookingIdsChange,
    handleDerivedTimeChange,
    effectiveDerivedSummary,
    linkedBookingsHydrating,
    fallbackSelectedBookings:
      selectedBookingRecords.length > 0
        ? selectedBookingRecords
        : initialSelectedBookingRecords,
  };
}
