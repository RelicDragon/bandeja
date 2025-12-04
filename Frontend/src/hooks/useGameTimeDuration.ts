import { useState, useCallback, useEffect } from 'react';
import { Club } from '@/types';

interface UseGameTimeDurationProps {
  clubs: Club[];
  selectedClub: string;
  initialDate?: Date;
  showPastTimes?: boolean;
  disableAutoAdjust?: boolean;
}

const getClubTimezone = (club: Club | undefined): string => {
  return club?.city?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
};

const getCurrentTimeInTimezone = (timezone: string): { date: Date; hour: number; minute: number } => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
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
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date1) === formatter.format(date2);
};

export const createDateFromClubTime = (date: Date, time: string, club: Club | undefined): Date => {
  const clubTimezone = getClubTimezone(club);
  const [hours, minutes] = time.split(':').map(Number);
  
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  
  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
  
  const localDate = new Date(dateStr);
  
  const formatter = new Intl.DateTimeFormat('en-US', {
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
  const formatter = new Intl.DateTimeFormat('en-US', {
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
    const utcTime = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzTime = new Date(now.toLocaleString('en-US', { timeZone: clubTimezone }));
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
  
  const utcTime = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  const clubTime = new Date(now.toLocaleString('en-US', { timeZone: clubTimezone }));
  const clubOffsetMs = clubTime.getTime() - utcTime.getTime();
  const clubOffset = clubOffsetMs / (1000 * 60 * 60);
  
  return Math.abs(localOffset - clubOffset) > 0.01;
};


export const useGameTimeDuration = ({
  clubs,
  selectedClub,
  initialDate,
  showPastTimes: initialShowPastTimes = false,
  disableAutoAdjust = false,
}: UseGameTimeDurationProps) => {
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    return initialDate || new Date();
  });
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [duration, setDuration] = useState<number>(2);
  const [showPastTimes, setShowPastTimes] = useState<boolean>(initialShowPastTimes);

  const generateTimeOptionsForDate = useCallback((date: Date) => {
    const times = [];
    const selectedCenter = clubs.find(pc => pc.id === selectedClub);
    const clubTimezone = getClubTimezone(selectedCenter);
    
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
      for (let minute = 0; minute < 60; minute += 30) {
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        
        if (isToday && !showPastTimes) {
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
  }, [clubs, selectedClub, showPastTimes]);

  const generateTimeOptions = useCallback(() => {
    return generateTimeOptionsForDate(selectedDate);
  }, [generateTimeOptionsForDate, selectedDate]);

  const getTimeSlotsForDuration = useCallback((startTime: string, duration: number) => {
    const slots = [];
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const totalMinutes = duration * 60;
    
    for (let i = 0; i < totalMinutes; i += 30) {
      const currentMinutes = startMinute + i;
      const hour = startHour + Math.floor(currentMinutes / 60);
      const minute = currentMinutes % 60;
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      slots.push(timeStr);
    }
    
    return slots;
  }, []);

  const canAccommodateDuration = useCallback((startTime: string, duration: number) => {
    const allTimeSlots = generateTimeOptions();
    const requiredSlots = getTimeSlotsForDuration(startTime, duration);
    
    return requiredSlots.every(slot => allTimeSlots.includes(slot));
  }, [generateTimeOptions, getTimeSlotsForDuration]);

  const getAdjustedStartTime = useCallback((clickedTime: string, duration: number) => {
    const allTimeSlots = generateTimeOptions();
    
    for (let i = allTimeSlots.length - 1; i >= 0; i--) {
      const potentialStartTime = allTimeSlots[i];
      const requiredSlots = getTimeSlotsForDuration(potentialStartTime, duration);
      
      const lastRequiredSlot = requiredSlots[requiredSlots.length - 1];
      if (lastRequiredSlot && allTimeSlots.includes(lastRequiredSlot)) {
        if (requiredSlots.includes(clickedTime)) {
          return potentialStartTime;
        }
      }
    }
    
    return null;
  }, [generateTimeOptions, getTimeSlotsForDuration]);

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
    showPastTimes,
    setShowPastTimes,
    generateTimeOptions,
    generateTimeOptionsForDate,
    canAccommodateDuration,
    getAdjustedStartTime,
    getTimeSlotsForDuration,
    isSlotHighlighted,
  };
};

