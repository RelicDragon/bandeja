import { useState, useEffect, useMemo } from 'react';
import { gamesApi } from '@/api';
import { Club, BookedCourtSlot } from '@/types';
import { getClubTimezone, createDateFromClubTime } from './useGameTimeDuration';

interface UseBookedCourtsProps {
  clubId: string | null;
  selectedDate: Date;
  selectedCourt: string | null;
  club?: Club;
}

interface BookedSlotInfo {
  courtName: string | null;
  startTime: string;
  endTime: string;
  hasBookedCourt: boolean;
}

export const useBookedCourts = ({
  clubId,
  selectedDate,
  selectedCourt,
  club,
}: UseBookedCourtsProps) => {
  const [bookedCourts, setBookedCourts] = useState<BookedCourtSlot[]>([]);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    if (!clubId || !startOfDay || !endOfDay) {
      setBookedCourts([]);
      return;
    }

    const fetchBookedCourts = async () => {
      setLoading(true);
      try {
        const response = await gamesApi.getBookedCourts({
          clubId,
          startDate: startOfDay,
          endDate: endOfDay,
          courtId: selectedCourt && selectedCourt !== 'notBooked' ? selectedCourt : undefined,
        });
        setBookedCourts(response.data || []);
      } catch (error) {
        console.error('Failed to fetch booked courts:', error);
        setBookedCourts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBookedCourts();
  }, [clubId, startOfDay, endOfDay, selectedCourt]);

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
          startTime: startTimeStr,
          endTime: endTimeStr,
          hasBookedCourt: booking.hasBookedCourt,
        });
      }
    });

    return slotsMap;
  }, [bookedCourts, club]);

  const isSlotBooked = (time: string): boolean => {
    return bookedSlots.has(time);
  };

  const getBookedSlotInfo = (time: string): BookedSlotInfo[] | null => {
    return bookedSlots.get(time) || null;
  };

  const getOverlappingBookings = (startTime: string, duration: number): BookedSlotInfo[] => {
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
          startTime: bookingStartTimeStr,
          endTime: bookingEndTimeStr,
          hasBookedCourt: booking.hasBookedCourt,
        });
      }
    });

    return overlapping;
  };

  const areAllSlotsUnconfirmed = (time: string): boolean => {
    const slots = bookedSlots.get(time);
    if (!slots || slots.length === 0) return false;
    return slots.every(slot => !slot.hasBookedCourt);
  };

  return {
    bookedSlots,
    isSlotBooked,
    getBookedSlotInfo,
    getOverlappingBookings,
    areAllSlotsUnconfirmed,
    loading,
  };
};

const formatTimeInClubTimezone = (date: Date, club?: Club): string => {
  const clubTimezone = getClubTimezone(club);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: clubTimezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(date);
};

