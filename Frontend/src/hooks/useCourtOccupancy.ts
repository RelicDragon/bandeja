import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { gamesApi } from '@/api';
import { Club, BookedCourtSlot } from '@/types';
import { getClubTimezone, createDateFromClubTime } from './useGameTimeDuration';
import {
  useBooktimeSnapshotRefresh,
  type BooktimeSnapshotBanner,
} from './useBooktimeSnapshotRefresh';
import { useAuthStore } from '@/store/authStore';
import { bookedCourtsEqual } from '@/utils/bookedCourts/bookedCourtsEqual';

interface UseCourtOccupancyProps {
  clubId: string | null;
  selectedDate: Date;
  selectedCourt: string | null;
  club?: Club;
  snapshotRefreshEnabled?: boolean;
  enabled?: boolean;
}

interface BookedSlotInfo {
  courtName: string | null;
  integrationCourtName: string | null;
  startTime: string;
  endTime: string;
  hasBookedCourt: boolean;
  clubBooked: boolean;
  holdBlocked?: boolean;
}

export const useCourtOccupancy = ({
  clubId,
  selectedDate,
  selectedCourt,
  club,
  snapshotRefreshEnabled = true,
  enabled = true,
}: UseCourtOccupancyProps) => {
  const [bookedCourts, setBookedCourts] = useState<BookedCourtSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [isLoadingExternalSlots, setIsLoadingExternalSlots] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const isBooktimeClub = club?.integrationType === 'BOOKTIME';
  const refreshEnabled =
    snapshotRefreshEnabled && isAuthenticated && isBooktimeClub && !!clubId && !!club;

  const {
    refreshSnapshot,
    isRefreshingSnapshot,
    snapshotBanner,
    liveApiLoading,
  } = useBooktimeSnapshotRefresh(refreshEnabled ? club : undefined, selectedDate, refreshEnabled);

  const refreshSnapshotRef = useRef(refreshSnapshot);
  refreshSnapshotRef.current = refreshSnapshot;
  const hasFetchedRef = useRef(false);

  const startOfDay = useMemo(() => {
    if (!clubId || !selectedDate) return null;

    const startDate = createDateFromClubTime(selectedDate, '00:00', club);
    return startDate.toISOString();
  }, [selectedDate, club, clubId]);

  const endOfDay = useMemo(() => {
    if (!clubId || !selectedDate) return null;

    const endDate = createDateFromClubTime(selectedDate, '23:59', club);
    return endDate.toISOString();
  }, [selectedDate, club, clubId]);

  const applyBookedCourts = useCallback((next: BookedCourtSlot[]) => {
    setBookedCourts((prev) => (bookedCourtsEqual(prev, next) ? prev : next));
  }, []);

  const applyExternalLoading = useCallback((next: boolean) => {
    setIsLoadingExternalSlots((prev) => (prev === next ? prev : next));
  }, []);

  const fetchBookedCourts = useCallback(async () => {
    if (!enabled || !clubId || !startOfDay || !endOfDay) {
      hasFetchedRef.current = false;
      setBookedCourts([]);
      setIsLoadingExternalSlots(false);
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
        courtId: selectedCourt && selectedCourt !== 'notBooked' ? selectedCourt : undefined,
      });
      applyBookedCourts(response.data || []);
      const externalLoading = response.isLoadingExternalSlots || false;
      applyExternalLoading(externalLoading);

      if (externalLoading && refreshEnabled && !liveApiLoading) {
        await refreshSnapshotRef.current({ force: true });
        const retry = await gamesApi.getBookedCourts({
          clubId,
          startDate: startOfDay,
          endDate: endOfDay,
          courtId: selectedCourt && selectedCourt !== 'notBooked' ? selectedCourt : undefined,
        });
        applyBookedCourts(retry.data || []);
        applyExternalLoading(retry.isLoadingExternalSlots || false);
      }

      hasFetchedRef.current = true;
    } catch (error) {
      console.error('Failed to fetch booked courts:', error);
      hasFetchedRef.current = false;
      setBookedCourts([]);
      setIsLoadingExternalSlots(false);
    } finally {
      if (!isBackgroundRefresh) {
        setLoading(false);
      }
    }
  }, [
    enabled,
    clubId,
    startOfDay,
    endOfDay,
    selectedCourt,
    refreshEnabled,
    liveApiLoading,
    applyBookedCourts,
    applyExternalLoading,
  ]);

  useEffect(() => {
    hasFetchedRef.current = false;
  }, [clubId, startOfDay, endOfDay, selectedCourt, enabled]);

  useEffect(() => {
    void fetchBookedCourts();
  }, [fetchBookedCourts]);

  const bookedSlots = useMemo(() => {
    const slotsMap = new Map<string, BookedSlotInfo[]>();

    bookedCourts.forEach((booking) => {
      const startDate = new Date(booking.startTime);
      const endDate = new Date(booking.endTime);

      const startTimeStr = formatTimeInClubTimezone(startDate, club);
      const endTimeStr = formatTimeInClubTimezone(endDate, club);

      const [startHour, startMinute] = startTimeStr.split(':').map(Number);
      const [endHour, endMinute] = endTimeStr.split(':').map(Number);

      const startMinutes = startHour * 60 + startMinute;
      const endMinutes = endHour * 60 + endMinute;

      for (let minutes = startMinutes; minutes < endMinutes; minutes += 30) {
        const hour = Math.floor(minutes / 60);
        const minute = minutes % 60;
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

        if (!slotsMap.has(timeStr)) {
          slotsMap.set(timeStr, []);
        }
        slotsMap.get(timeStr)!.push({
          courtName: booking.courtName,
          integrationCourtName: booking.integrationCourtName ?? null,
          startTime: startTimeStr,
          endTime: endTimeStr,
          hasBookedCourt: booking.hasBookedCourt,
          clubBooked: booking.clubBooked || false,
          holdBlocked: booking.holdBlocked,
        });
      }
    });

    return slotsMap;
  }, [bookedCourts, club]);

  const isSlotBooked = useCallback((time: string): boolean => {
    return bookedSlots.has(time);
  }, [bookedSlots]);

  const getBookedSlotInfo = useCallback((time: string): BookedSlotInfo[] | null => {
    return bookedSlots.get(time) || null;
  }, [bookedSlots]);

  const getOverlappingBookings = useCallback((startTime: string, duration: number): BookedSlotInfo[] => {
    if (!startTime || !duration) return [];

    const [startHour, startMinute] = startTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = startMinutes + (duration * 60);

    const overlapping: BookedSlotInfo[] = [];

    bookedCourts.forEach((booking) => {
      const bookingStartDate = new Date(booking.startTime);
      const bookingEndDate = new Date(booking.endTime);

      const bookingStartTimeStr = formatTimeInClubTimezone(bookingStartDate, club);
      const bookingEndTimeStr = formatTimeInClubTimezone(bookingEndDate, club);

      const [bookingStartHour, bookingStartMinute] = bookingStartTimeStr.split(':').map(Number);
      const [bookingEndHour, bookingEndMinute] = bookingEndTimeStr.split(':').map(Number);

      const bookingStartMinutes = bookingStartHour * 60 + bookingStartMinute;
      const bookingEndMinutes = bookingEndHour * 60 + bookingEndMinute;

      if (bookingStartMinutes < endMinutes && bookingEndMinutes > startMinutes) {
        overlapping.push({
          courtName: booking.courtName,
          integrationCourtName: booking.integrationCourtName ?? null,
          startTime: bookingStartTimeStr,
          endTime: bookingEndTimeStr,
          hasBookedCourt: booking.hasBookedCourt,
          clubBooked: booking.clubBooked || false,
          holdBlocked: booking.holdBlocked,
        });
      }
    });

    return overlapping;
  }, [bookedCourts, club]);

  const areAllSlotsUnconfirmed = useCallback((time: string): boolean => {
    const slots = bookedSlots.get(time);
    if (!slots || slots.length === 0) return false;
    return slots.every(slot => !slot.hasBookedCourt);
  }, [bookedSlots]);

  const hasExternallyBookedSlot = useCallback((time: string): boolean => {
    const slots = bookedSlots.get(time);
    if (!slots || slots.length === 0) return false;
    return slots.some((slot) => slot.clubBooked || slot.holdBlocked);
  }, [bookedSlots]);

  const isSlotHardBlocked = useCallback((time: string): boolean => {
    const slots = bookedSlots.get(time);
    if (!slots || slots.length === 0) return false;
    return slots.some((slot) => slot.clubBooked || slot.holdBlocked);
  }, [bookedSlots]);

  const externalSlotsLoading =
    isRefreshingSnapshot || loading || (isLoadingExternalSlots && liveApiLoading);

  return {
    bookedSlots,
    isSlotBooked,
    getBookedSlotInfo,
    getOverlappingBookings,
    areAllSlotsUnconfirmed,
    hasExternallyBookedSlot,
    isSlotHardBlocked,
    loading,
    isLoadingExternalSlots: externalSlotsLoading,
    snapshotBanner,
    refreshSnapshot,
    refetch: fetchBookedCourts,
  };
};

export type { BooktimeSnapshotBanner };

const formatTimeInClubTimezone = (date: Date, club?: Club): string => {
  const clubTimezone = getClubTimezone(club);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: clubTimezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(date);
};
