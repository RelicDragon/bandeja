import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { gamesApi } from '@/api';
import type { BookedCourtSlot, Club, Court } from '@/types';
import { createDateFromClubTime, getClubTimezone } from '@/hooks/useGameTimeDuration';
import { bookedCourtsEqual } from '@/utils/bookedCourts/bookedCourtsEqual';
import { computeCourtDayOccupancy, type CourtDayOccupancy } from '@/utils/bookedCourts/courtDayOccupancy';
import { isSameCalendarDayInTimezone } from '@/utils/clubSchedule/daySlots';

interface UseCourtDayOccupancyProps {
  clubId: string | null;
  club?: Club;
  courts: Court[];
  selectedDate: Date;
  enabled?: boolean;
}

export function useCourtDayOccupancy({
  clubId,
  club,
  courts,
  selectedDate,
  enabled = true,
}: UseCourtDayOccupancyProps) {
  const [bookings, setBookings] = useState<BookedCourtSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const hasFetchedRef = useRef(false);
  const [referenceNow, setReferenceNow] = useState(() => new Date());

  const isSelectedClubToday = useMemo(() => {
    if (!club) return false;
    return isSameCalendarDayInTimezone(selectedDate, referenceNow, getClubTimezone(club));
  }, [club, selectedDate, referenceNow]);

  useEffect(() => {
    if (!enabled || !isSelectedClubToday) return;
    setReferenceNow(new Date());
    const intervalId = window.setInterval(() => setReferenceNow(new Date()), 60_000);
    return () => window.clearInterval(intervalId);
  }, [enabled, isSelectedClubToday, selectedDate, club?.id]);

  const startOfDay = useMemo(() => {
    if (!clubId) return null;
    return createDateFromClubTime(selectedDate, '00:00', club).toISOString();
  }, [clubId, club, selectedDate]);

  const endOfDay = useMemo(() => {
    if (!clubId) return null;
    return createDateFromClubTime(selectedDate, '23:59', club).toISOString();
  }, [clubId, club, selectedDate]);

  const applyBookings = useCallback((next: BookedCourtSlot[]) => {
    setBookings((prev) => (bookedCourtsEqual(prev, next) ? prev : next));
  }, []);

  const fetchOccupancy = useCallback(async () => {
    if (!enabled || !clubId || !startOfDay || !endOfDay) {
      hasFetchedRef.current = false;
      applyBookings([]);
      setLoading(false);
      return;
    }

    const isBackgroundRefresh = hasFetchedRef.current;
    if (!isBackgroundRefresh) {
      setLoading(true);
    }

    try {
      const response = await gamesApi.getBookedCourts({
        clubId,
        startDate: startOfDay,
        endDate: endOfDay,
      });
      applyBookings(response.data || []);
      hasFetchedRef.current = true;
    } catch (error) {
      console.error('Failed to fetch court day occupancy:', error);
      hasFetchedRef.current = false;
      applyBookings([]);
    } finally {
      if (!isBackgroundRefresh) {
        setLoading(false);
      }
    }
  }, [enabled, clubId, startOfDay, endOfDay, applyBookings]);

  useEffect(() => {
    hasFetchedRef.current = false;
  }, [clubId, startOfDay, endOfDay, enabled]);

  useEffect(() => {
    void fetchOccupancy();
  }, [fetchOccupancy]);

  const occupancyByCourtId = useMemo(
    (): Map<string, CourtDayOccupancy> =>
      computeCourtDayOccupancy(courts, bookings, club, selectedDate, referenceNow),
    [courts, bookings, club, selectedDate, referenceNow],
  );

  return { occupancyByCourtId, loading };
}
