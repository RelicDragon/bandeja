import { useState, useCallback, useEffect, useMemo } from 'react';
import { Club } from '@/types';
import { resolveSlotMinutes } from '@/utils/clubSchedule/timeSlots';

interface UseGameTimeDurationProps {
  clubs: Club[];
  selectedClub: string;
  initialDate?: Date;
  disableAutoAdjust?: boolean;
}

export const getClubTimezone = (club: Club | undefined): string => {
  return club?.city?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
};

const getCurrentTimeInTimezone = (timezone: string): { date: Date; hour: number; minute: number } => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(now);
  const year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
  const month = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
  const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
  const second = parseInt(parts.find(p => p.type === 'second')?.value || '0');
  
  const date = new Date(year, month, day, hour, minute, second);
  return { date, hour, minute };
};

const isSameDateInTimezone = (date1: Date, date2: Date, timezone: string): boolean => {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date1) === formatter.format(date2);
};

const toMinutes = (time: string): number | null => {
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
};

export const createDateFromClubTime = (date: Date, time: string, club: Club | undefined): Date => {
  const clubTimezone = getClubTimezone(club);
  const [hours, minutes] = time.split(':').map(Number);
  
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  
  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
  
  const localDate = new Date(dateStr);
  
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: clubTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  const localParts = formatter.formatToParts(localDate);
  const localHour = parseInt(localParts.find(p => p.type === 'hour')?.value || '0');
  const localMinute = parseInt(localParts.find(p => p.type === 'minute')?.value || '0');
  
  const targetTime = hours * 60 + minutes;
  const actualTime = localHour * 60 + localMinute;
  const diffMinutes = targetTime - actualTime;
  
  return new Date(localDate.getTime() + diffMinutes * 60000);
};

export const formatTimeInClubTimezone = (date: Date, club: Club | undefined): string => {
  const clubTimezone = getClubTimezone(club);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: clubTimezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(date);
};

export const getTimezoneOffsetString = (club: Club | undefined): string => {
  const clubTimezone = getClubTimezone(club);
  const now = new Date();
  
  try {
    const utcTime = new Date(now.toLocaleString('en-GB', { timeZone: 'UTC' }));
    const tzTime = new Date(now.toLocaleString('en-GB', { timeZone: clubTimezone }));
    const offsetMs = tzTime.getTime() - utcTime.getTime();
    const offsetHours = offsetMs / (1000 * 60 * 60);
    const sign = offsetHours >= 0 ? '+' : '-';
    const hours = Math.abs(Math.floor(offsetHours));
    const minutes = Math.abs(Math.floor((offsetHours % 1) * 60));
    
    if (minutes === 0) {
      return `GMT${sign}${hours}`;
    }
    return `GMT${sign}${hours}:${String(minutes).padStart(2, '0')}`;
  } catch (error) {
    return '';
  }
};

export const getLocalTimezoneOffsetString = (): string => {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * -60000;
  const offsetHours = offsetMs / (1000 * 60 * 60);
  const sign = offsetHours >= 0 ? '+' : '-';
  const hours = Math.abs(Math.floor(offsetHours));
  const minutes = Math.abs(Math.floor((offsetHours % 1) * 60));
  
  if (minutes === 0) {
    return `GMT${sign}${hours}`;
  }
  return `GMT${sign}${hours}:${String(minutes).padStart(2, '0')}`;
};

export const isTimezoneDifferent = (club: Club | undefined): boolean => {
  if (!club) return false;
  const clubTimezone = getClubTimezone(club);
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  if (clubTimezone === localTimezone) return false;
  
  const now = new Date();
  const localOffset = -now.getTimezoneOffset() / 60;
  
  const utcTime = new Date(now.toLocaleString('en-GB', { timeZone: 'UTC' }));
  const clubTime = new Date(now.toLocaleString('en-GB', { timeZone: clubTimezone }));
  const clubOffsetMs = clubTime.getTime() - utcTime.getTime();
  const clubOffset = clubOffsetMs / (1000 * 60 * 60);
  
  return Math.abs(localOffset - clubOffset) > 0.01;
};


export const useGameTimeDuration = ({
  clubs,
  selectedClub,
  initialDate,
  disableAutoAdjust = false,
}: UseGameTimeDurationProps) => {
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    return initialDate || new Date();
  });
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [duration, setDuration] = useState<number>(2);

  // End of the visible grid in minutes, derived from the same closing time as
  // generateTimeOptionsForDate. Duration fit is checked against it Booktime
  // style: a start fits when start + duration stays inside the grid, with no
  // step synthesis anywhere downstream.
  const gridEndMinutes = useMemo(() => {
    const selectedCenter = clubs.find((pc) => pc.id === selectedClub);
    if (selectedCenter?.openingTime && selectedCenter?.closingTime) {
      const closingParts = selectedCenter.closingTime.split(':');
      let endHour = parseInt(closingParts[0]);
      if (parseInt(closingParts[1]) > 0) {
        endHour += 1;
      }
      return endHour * 60;
    }
    return 24 * 60;
  }, [clubs, selectedClub]);

  const generateTimeOptionsForDate = useCallback((date: Date) => {
    const times = [];
    const selectedCenter = clubs.find(pc => pc.id === selectedClub);
    const clubTimezone = getClubTimezone(selectedCenter);
    const step = resolveSlotMinutes(
      (selectedCenter as Club & { defaultSlotMinutes?: number | null })?.defaultSlotMinutes
    );

    let startHour = 0;
    let endHour = 24;

    if (selectedCenter?.openingTime && selectedCenter?.closingTime) {
      const openingParts = selectedCenter.openingTime.split(':');
      const closingParts = selectedCenter.closingTime.split(':');
      startHour = parseInt(openingParts[0]);
      endHour = parseInt(closingParts[0]);
      if (parseInt(closingParts[1]) > 0) {
        endHour += 1;
      }
    }

    const nowLocal = new Date();
    const nowInClubTz = getCurrentTimeInTimezone(clubTimezone);
    const isToday = isSameDateInTimezone(date, nowLocal, clubTimezone);

    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += step) {
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        
        if (isToday) {
          const nowTime = nowInClubTz.hour * 60 + nowInClubTz.minute;
          const slotTime = hour * 60 + minute;
          
          if (slotTime <= nowTime) {
            continue;
          }
        }
        
        times.push(timeStr);
      }
    }
    return times;
  }, [clubs, selectedClub]);

  const generateTimeOptions = useCallback(() => {
    return generateTimeOptionsForDate(selectedDate);
  }, [generateTimeOptionsForDate, selectedDate]);

  // Same contract as the Booktime time options: the visible option list is the
  // source of truth, worked purely by time ranges, never by synthesizing
  // sub-steps. Booktime pre-filters fitting starts per duration; the base grid
  // covers fit explicitly via gridEndMinutes instead.
  const getTimeSlotsForDuration = useCallback((startTime: string, duration: number) => {
    const options = generateTimeOptions();
    const startMin = toMinutes(startTime);
    if (startMin == null) return [];
    const endMin = startMin + Math.round(duration * 60);
    return options.filter((time) => {
      const t = toMinutes(time);
      return t != null && t >= startMin && t < endMin;
    });
  }, [generateTimeOptions]);

  const canAccommodateDuration = useCallback((startTime: string, durHours: number) => {
    const options = generateTimeOptions();
    const startMin = toMinutes(startTime);
    if (startMin == null) return false;
    return options.includes(startTime) && startMin + Math.round(durHours * 60) <= gridEndMinutes;
  }, [generateTimeOptions, gridEndMinutes]);

  const getAdjustedStartTime = useCallback((clickedTime: string, durHours: number) => {
    const options = generateTimeOptions();
    const clickedMin = toMinutes(clickedTime);
    if (clickedMin == null) return null;
    const spanMinutes = Math.round(durHours * 60);
    const matches = options.filter((start) => {
      const startMin = toMinutes(start);
      return (
        startMin != null &&
        startMin <= clickedMin &&
        clickedMin < startMin + spanMinutes &&
        startMin + spanMinutes <= gridEndMinutes
      );
    });
    const last = matches[matches.length - 1];
    return last !== undefined ? last : null;
  }, [generateTimeOptions, gridEndMinutes]);

  const isSlotHighlighted = useCallback((time: string) => {
    if (!selectedTime) return false;
    const requiredSlots = getTimeSlotsForDuration(selectedTime, duration);
    return requiredSlots.includes(time);
  }, [selectedTime, duration, getTimeSlotsForDuration]);

  useEffect(() => {
    if (disableAutoAdjust) return;
    
    if (selectedTime && !canAccommodateDuration(selectedTime, duration)) {
      const availableTimes = generateTimeOptions();
      
      for (let i = availableTimes.length - 1; i >= 0; i--) {
        const potentialStartTime = availableTimes[i];
        const requiredSlots = getTimeSlotsForDuration(potentialStartTime, duration);
        const lastRequiredSlot = requiredSlots[requiredSlots.length - 1];
        
        if (lastRequiredSlot && availableTimes.includes(lastRequiredSlot)) {
          setSelectedTime(potentialStartTime);
          break;
        }
      }
    }
  }, [duration, selectedTime, canAccommodateDuration, generateTimeOptions, getTimeSlotsForDuration, disableAutoAdjust]);

  return {
    selectedDate,
    setSelectedDate,
    selectedTime,
    setSelectedTime,
    duration,
    setDuration,
    generateTimeOptions,
    generateTimeOptionsForDate,
    canAccommodateDuration,
    getAdjustedStartTime,
    getTimeSlotsForDuration,
    isSlotHighlighted,
  };
};

