import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Club, Court } from '@/types';
import {
  aggregateFreeSlotStarts,
  booktimeCourtMappingKey,
  computeCourtAvailabilityRows,
  fetchBooktimeCourtAvailabilityForDate,
  mappedBooktimeCourts,
  parseSlotMinutes,
} from '@/integrations/booktime/availability';
import { formatClubDateKey } from '@/integrations/booktime/slots';
import { useBooktimeLiveApiEnabled } from '@/hooks/useBooktimeLiveApiEnabled';
import { getBooktimeCompanyId } from '@shared/clubIntegration';

type OptionsCache = Map<string, string[]>;

type UseBooktimeTimeOptionsParams = {
  club: Club | undefined;
  courts?: Court[];
  selectedDate: Date;
  durationHours: number;
  selectedCourtId: string | null;
  enabled: boolean;
};

export function useBooktimeTimeOptions({
  club,
  courts,
  selectedDate,
  durationHours,
  selectedCourtId,
  enabled,
}: UseBooktimeTimeOptionsParams) {
  const [cache, setCache] = useState<OptionsCache>(new Map());
  const [cacheTick, setCacheTick] = useState(0);
  const cacheRef = useRef(cache);
  cacheRef.current = cache;
  const [loading, setLoading] = useState(false);
  const { apiEnabled: liveApiEnabled } = useBooktimeLiveApiEnabled(club?.id, enabled);

  const durationMinutes = Math.round(durationHours * 60);
  const companyId = getBooktimeCompanyId(club);
  const courtMappingKey = booktimeCourtMappingKey(courts, club);
  const mappedCourtsRef = useRef<Court[]>([]);
  mappedCourtsRef.current = club ? mappedBooktimeCourts(club, courts) : [];

  const loadDate = useCallback(
    async (date: Date) => {
      if (!enabled || !liveApiEnabled || !club || !companyId) return;
      const dateKey = formatClubDateKey(date, club);
      if (!courtMappingKey) {
        setCache((prev) => {
          const next = new Map(prev);
          next.set(dateKey, []);
          return next;
        });
        setCacheTick((tick) => tick + 1);
        return;
      }
      setLoading(true);
      try {
        const { raw } = await fetchBooktimeCourtAvailabilityForDate({
          club,
          companyId,
          date,
        });
        const rows = computeCourtAvailabilityRows({
          club,
          courts: mappedCourtsRef.current,
          raw,
          durationMinutes,
          dateKey,
          courtFilter: selectedCourtId,
        });
        const options = selectedCourtId
          ? (rows[0]?.freeSlots ?? [])
          : aggregateFreeSlotStarts(rows);

        setCache((prev) => {
          const next = new Map(prev);
          next.set(dateKey, options);
          return next;
        });
        setCacheTick((tick) => tick + 1);
      } catch (err) {
        console.error('Booktime time options load failed:', err);
        setCache((prev) => {
          const next = new Map(prev);
          next.set(dateKey, []);
          return next;
        });
        setCacheTick((tick) => tick + 1);
      } finally {
        setLoading(false);
      }
    },
    [club, companyId, courtMappingKey, durationMinutes, enabled, liveApiEnabled, selectedCourtId]
  );

  useEffect(() => {
    setCache(new Map());
    setCacheTick((tick) => tick + 1);
  }, [club?.id, companyId, selectedCourtId, courtMappingKey]);

  useEffect(() => {
    void loadDate(selectedDate);
  }, [loadDate, selectedDate]);

  useEffect(() => {
    if (!enabled || !club) return;
    const today = new Date();
    const todayKey = formatClubDateKey(today, club);
    const selectedKey = formatClubDateKey(selectedDate, club);
    if (todayKey !== selectedKey) {
      void loadDate(today);
    }
  }, [club, enabled, loadDate, selectedDate]);

  const optionsForDate = useCallback(
    (date: Date): string[] => {
      void cacheTick;
      if (!club) return [];
      const dateKey = formatClubDateKey(date, club);
      return cacheRef.current.get(dateKey) ?? [];
    },
    [cacheTick, club]
  );

  const generateTimeOptions = useCallback(
    () => optionsForDate(selectedDate),
    [optionsForDate, selectedDate]
  );

  const generateTimeOptionsForDate = optionsForDate;

  const canAccommodateDuration = useCallback(
    (startTime: string, durHours: number) => {
      if (Math.round(durHours * 60) !== durationMinutes) return false;
      return optionsForDate(selectedDate).includes(startTime);
    },
    [durationMinutes, optionsForDate, selectedDate]
  );

  const getTimeSlotsForDuration = useCallback(
    (startTime: string, durHours: number) => {
      const options = optionsForDate(selectedDate);
      const startMin = parseSlotMinutes(startTime) ?? 0;
      const endMin = startMin + Math.round(durHours * 60);
      return options.filter((time) => {
        const t = parseSlotMinutes(time);
        return t != null && t >= startMin && t < endMin;
      });
    },
    [optionsForDate, selectedDate]
  );

  const getAdjustedStartTime = useCallback(
    (clickedTime: string, durHours: number) => {
      if (Math.round(durHours * 60) !== durationMinutes) return null;
      const options = optionsForDate(selectedDate);
      const clickedMin = parseSlotMinutes(clickedTime);
      if (clickedMin == null) return null;
      const matches = options.filter((start) => {
        const startMin = parseSlotMinutes(start);
        return startMin != null && startMin <= clickedMin && clickedMin < startMin + durationMinutes;
      });
      return matches.length > 0 ? matches[matches.length - 1]! : null;
    },
    [durationMinutes, optionsForDate, selectedDate]
  );

  const isSlotHighlighted = useCallback(
    (time: string, selectedTime: string, durHours: number) => {
      if (!selectedTime) return false;
      const startMin = parseSlotMinutes(selectedTime);
      const t = parseSlotMinutes(time);
      if (startMin == null || t == null) return false;
      const endMin = startMin + Math.round(durHours * 60);
      return t >= startMin && t < endMin;
    },
    []
  );

  const active = enabled && liveApiEnabled && !!club && !!companyId;

  const reload = useCallback(() => {
    void loadDate(selectedDate);
  }, [loadDate, selectedDate]);

  return useMemo(
    () => ({
      active,
      loading,
      reload,
      generateTimeOptions,
      generateTimeOptionsForDate,
      canAccommodateDuration,
      getAdjustedStartTime,
      getTimeSlotsForDuration,
      isSlotHighlighted,
    }),
    [
      active,
      loading,
      reload,
      generateTimeOptions,
      generateTimeOptionsForDate,
      canAccommodateDuration,
      getAdjustedStartTime,
      getTimeSlotsForDuration,
      isSlotHighlighted,
    ]
  );
}
