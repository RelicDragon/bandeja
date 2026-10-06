import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { gamesApi } from '@/api';
import { Club, Court, BookedCourtSlot } from '@/types';
import { getClubTimezone, createDateFromClubTime } from './useGameTimeDuration';
import {
  useClubSnapshotRefresh,
  type ClubSnapshotBanner,
} from './useClubSnapshotRefresh';
import { clubHasBookingIntegration } from '@shared/clubIntegration';
import { useAuthStore } from '@/store/authStore';
import { bookedCourtsEqual } from '@/utils/bookedCourts/bookedCourtsEqual';
import {
  areAggregateSlotsUnconfirmed,
  buildCourtTimeSlotMap,
  filterBookingsByCourts,
  isAggregateTimeBooked,
  isAggregateTimeFullyExternallyBlocked,
} from '@/utils/bookedCourts/aggregateSportCourtOccupancy';

interface UseCourtOccupancyProps {
  clubId: string | null;
  selectedDate: Date;
  selectedCourt: string | null;
  club?: Club;
  occupancyCourts?: Court[];
  snapshotRefreshEnabled?: boolean;
  enabled?: boolean;
  /** The game being edited: its own court blocks are never "taken". */
  excludeGameId?: string | null;
  /**
   * Courts the organizer said they already reserved: the club's block on them
   * is their own booking, so it is not shown as taken.
   */
  ownClubBookingCourtIds?: readonly string[];
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
  occupancyCourts,
  snapshotRefreshEnabled = true,
  enabled = true,
  excludeGameId = null,
  ownClubBookingCourtIds,
}: UseCourtOccupancyProps) => {
  const [bookedCourts, setBookedCourts] = useState<BookedCourtSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [isLoadingExternalSlots, setIsLoadingExternalSlots] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const hasBookingIntegration = clubHasBookingIntegration(club);
  const refreshEnabled =
    snapshotRefreshEnabled && isAuthenticated && hasBookingIntegration && !!clubId && !!club;

  const {
    refreshSnapshot,
    isRefreshingSnapshot,
    snapshotBanner,
    liveApiLoading,
  } = useClubSnapshotRefresh(refreshEnabled ? club : undefined, selectedDate, refreshEnabled);

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

  const isAggregateOccupancy =
    (!selectedCourt || selectedCourt === 'notBooked') &&
    occupancyCourts != null &&
    occupancyCourts.length > 0;

  const ownCourtsKey = ownClubBookingCourtIds?.join(',') ?? '';
  const visibleBookedCourts = useMemo(() => {
    const ownCourts = new Set(ownCourtsKey ? ownCourtsKey.split(',') : []);
    if (!excludeGameId && ownCourts.size === 0) return bookedCourts;
    return bookedCourts.filter((booking) => {
      if (excludeGameId && booking.gameId === excludeGameId) return false;
      return !(isClaimableClubBooking(booking) && booking.courtId != null && ownCourts.has(booking.courtId));
    });
  }, [bookedCourts, excludeGameId, ownCourtsKey]);

  const relevantBookedCourts = useMemo(() => {
    if (!isAggregateOccupancy || !occupancyCourts) return visibleBookedCourts;
    return filterBookingsByCourts(visibleBookedCourts, occupancyCourts);
  }, [visibleBookedCourts, isAggregateOccupancy, occupancyCourts]);

  const courtTimeMap = useMemo(() => {
    if (!isAggregateOccupancy) return null;
    return buildCourtTimeSlotMap(relevantBookedCourts, club, formatTimeInClubTimezone);
  }, [relevantBookedCourts, isAggregateOccupancy, club]);

  const bookedSlots = useMemo(() => {
    if (isAggregateOccupancy && courtTimeMap && occupancyCourts) {
      const slotsMap = new Map<string, BookedSlotInfo[]>();
      for (const [key, info] of courtTimeMap) {
        const time = key.slice(key.indexOf(':') + 1);
        const { courtId: _courtId, ...slotInfo } = info;
        const existing = slotsMap.get(time);
        if (existing) {
          existing.push(slotInfo);
        } else {
          slotsMap.set(time, [slotInfo]);
        }
      }
      return slotsMap;
    }

    const slotsMap = new Map<string, BookedSlotInfo[]>();

    relevantBookedCourts.forEach((booking) => {
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
  }, [relevantBookedCourts, club, isAggregateOccupancy, courtTimeMap, occupancyCourts]);

  const isSlotBooked = useCallback((time: string): boolean => {
    if (isAggregateOccupancy && courtTimeMap && occupancyCourts) {
      return isAggregateTimeBooked(time, occupancyCourts, courtTimeMap);
    }
    return bookedSlots.has(time);
  }, [bookedSlots, isAggregateOccupancy, courtTimeMap, occupancyCourts]);

  const getBookedSlotInfo = useCallback((time: string): BookedSlotInfo[] | null => {
    return bookedSlots.get(time) || null;
  }, [bookedSlots]);

  const getOverlappingBookings = useCallback((startTime: string, duration: number): BookedSlotInfo[] => {
    if (!startTime || !duration) return [];

    const [startHour, startMinute] = startTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = startMinutes + (duration * 60);

    const overlapping: BookedSlotInfo[] = [];

    relevantBookedCourts.forEach((booking) => {
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
  }, [relevantBookedCourts, club]);

  const areAllSlotsUnconfirmed = useCallback((time: string): boolean => {
    if (isAggregateOccupancy && courtTimeMap && occupancyCourts) {
      return areAggregateSlotsUnconfirmed(time, occupancyCourts, courtTimeMap);
    }
    const slots = bookedSlots.get(time);
    if (!slots || slots.length === 0) return false;
    return slots.every(slot => !slot.hasBookedCourt);
  }, [bookedSlots, isAggregateOccupancy, courtTimeMap, occupancyCourts]);

  const hasExternallyBookedSlot = useCallback((time: string): boolean => {
    if (isAggregateOccupancy && courtTimeMap && occupancyCourts) {
      return isAggregateTimeFullyExternallyBlocked(time, occupancyCourts, courtTimeMap);
    }
    const slots = bookedSlots.get(time);
    if (!slots || slots.length === 0) return false;
    return slots.some((slot) => slot.clubBooked || slot.holdBlocked);
  }, [bookedSlots, isAggregateOccupancy, courtTimeMap, occupancyCourts]);

  const isSlotHardBlocked = useCallback((time: string): boolean => {
    if (isAggregateOccupancy && courtTimeMap && occupancyCourts) {
      return isAggregateTimeFullyExternallyBlocked(time, occupancyCourts, courtTimeMap);
    }
    const slots = bookedSlots.get(time);
    if (!slots || slots.length === 0) return false;
    return slots.some((slot) => slot.clubBooked || slot.holdBlocked);
  }, [bookedSlots, isAggregateOccupancy, courtTimeMap, occupancyCourts]);

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
    /** The day's blocks after `excludeGameId` / `ownClubBookingCourtIds`. */
    visibleBookedCourts,
  };
};

/** A club-system booking (not an admin hold): could be the organizer's own phone booking. */
export function isClaimableClubBooking(booking: Pick<BookedCourtSlot, 'clubBooked' | 'holdBlocked' | 'slotKind'>): boolean {
  if (booking.holdBlocked || booking.slotKind === 'hold') return false;
  return Boolean(booking.clubBooked || booking.slotKind === 'external');
}

export type { ClubSnapshotBanner };

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
