import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Club, Court } from '@/types';
import {
  aggregateFreeSlotStarts,
  booktimeCourtMappingKey,
  computeCourtAvailabilityRows,
  fetchBooktimeCourtAvailabilityForDate,
  intersectFreeSlotStarts,
  mappedBooktimeCourts,
  parseSlotMinutes,
  type BooktimeCourtAvailabilityRow,
} from '@/integrations/booktime/availability';
import { formatClubDateKey } from '@/integrations/booktime/slots';
import { useBooktimeLiveApiEnabled } from '@/hooks/useBooktimeLiveApiEnabled';
import { getBooktimeCompanyId } from '@shared/clubIntegration';

export function buildBooktimeOptionsCacheKey(
  dateKey: string,
  courtId: string | null,
  durationMinutes: number
): string {
  return `${dateKey}|${courtId ?? 'all'}|${durationMinutes}`;
}

type OptionsCache = Map<string, string[]>;
type RowsCache = Map<string, BooktimeCourtAvailabilityRow[]>;

type UseBooktimeTimeOptionsParams = {
  club: Club | undefined;
  courts?: Court[];
  selectedDate: Date;
  durationHours: number;
  selectedCourtId: string | null;
  selectedCourtIds?: string[];
  enabled: boolean;
};

export function useBooktimeTimeOptions({
  club,
  courts,
  selectedDate,
  durationHours,
  selectedCourtId,
  selectedCourtIds,
  enabled,
}: UseBooktimeTimeOptionsParams) {
  const [cache, setCache] = useState<OptionsCache>(new Map());
  const [rowsCache, setRowsCache] = useState<RowsCache>(new Map());
  const [cacheTick, setCacheTick] = useState(0);
  const cacheRef = useRef(cache);
  cacheRef.current = cache;
  const rowsCacheRef = useRef(rowsCache);
  rowsCacheRef.current = rowsCache;
  const [loadingTick, setLoadingTick] = useState(0);
  const inFlightKeysRef = useRef(new Set<string>());
  const requestVersionsRef = useRef(new Map<string, number>());
  const { apiEnabled: liveApiEnabled } = useBooktimeLiveApiEnabled(club?.id, enabled);

  const durationMinutes = Math.round(durationHours * 60);
  const companyId = getBooktimeCompanyId(club);
  const courtMappingKey = booktimeCourtMappingKey(courts, club);
  const mappedCourtsRef = useRef<Court[]>([]);
  mappedCourtsRef.current = club ? mappedBooktimeCourts(club, courts) : [];
  const normalizedSelectedCourtIds = useMemo(() => {
    const source = selectedCourtIds ?? (selectedCourtId ? [selectedCourtId] : []);
    return [...new Set(source.filter((id) => id && id !== 'notBooked'))].sort();
  }, [selectedCourtId, selectedCourtIds]);
  const explicitCourtSelection = selectedCourtIds !== undefined;
  const courtSelectionCacheId = explicitCourtSelection
    ? normalizedSelectedCourtIds.length > 0
      ? normalizedSelectedCourtIds.join(',')
      : '__none__'
    : selectedCourtId;

  const bumpLoading = useCallback(() => {
    setLoadingTick((tick) => tick + 1);
  }, []);

  const loadDate = useCallback(
    async (date: Date, courtIds: string[] | null, options?: { force?: boolean }) => {
      if (!enabled || !liveApiEnabled || !club || !companyId) return;
      const dateKey = formatClubDateKey(date, club);
      const courtCacheId = courtIds
        ? courtIds.length > 0
          ? courtIds.join(',')
          : '__none__'
        : null;
      const cacheKey = buildBooktimeOptionsCacheKey(dateKey, courtCacheId, durationMinutes);
      if (!options?.force && cacheRef.current.has(cacheKey)) return;
      if (courtIds && courtIds.length === 0) {
        setCache((prev) => {
          const next = new Map(prev);
          next.set(cacheKey, []);
          return next;
        });
        setRowsCache((prev) => {
          const next = new Map(prev);
          next.set(cacheKey, []);
          return next;
        });
        setCacheTick((tick) => tick + 1);
        return;
      }
      if (!courtMappingKey) {
        setCache((prev) => {
          const next = new Map(prev);
          next.set(cacheKey, []);
          return next;
        });
        setRowsCache((prev) => {
          const next = new Map(prev);
          next.set(cacheKey, []);
          return next;
        });
        setCacheTick((tick) => tick + 1);
        return;
      }

      const requestVersion = (requestVersionsRef.current.get(cacheKey) ?? 0) + 1;
      requestVersionsRef.current.set(cacheKey, requestVersion);
      inFlightKeysRef.current.add(cacheKey);
      bumpLoading();
      try {
        const { raw } = await fetchBooktimeCourtAvailabilityForDate({
          club,
          companyId,
          date,
        });
        if (requestVersionsRef.current.get(cacheKey) !== requestVersion) return;

        const rows = computeCourtAvailabilityRows({
          club,
          courts: mappedCourtsRef.current,
          raw,
          durationMinutes,
          dateKey,
          courtFilter: courtIds?.length === 1 ? courtIds[0] : null,
        });
        const scopedRows =
          courtIds && courtIds.length > 1
            ? rows.filter((row) => courtIds.includes(row.court.id))
            : rows;
        const options = courtIds
          ? intersectFreeSlotStarts(scopedRows)
          : aggregateFreeSlotStarts(scopedRows);

        setCache((prev) => {
          const next = new Map(prev);
          next.set(cacheKey, options);
          return next;
        });
        setRowsCache((prev) => {
          const next = new Map(prev);
          next.set(cacheKey, scopedRows);
          return next;
        });
        setCacheTick((tick) => tick + 1);
      } catch (err) {
        console.error('Booktime time options load failed:', err);
        if (requestVersionsRef.current.get(cacheKey) !== requestVersion) return;
        setCache((prev) => {
          const next = new Map(prev);
          next.set(cacheKey, []);
          return next;
        });
        setRowsCache((prev) => {
          const next = new Map(prev);
          next.set(cacheKey, []);
          return next;
        });
        setCacheTick((tick) => tick + 1);
      } finally {
        inFlightKeysRef.current.delete(cacheKey);
        bumpLoading();
      }
    },
    [club, companyId, courtMappingKey, durationMinutes, enabled, liveApiEnabled, bumpLoading],
  );

  useEffect(() => {
    setCache(new Map());
    setRowsCache(new Map());
    setCacheTick((tick) => tick + 1);
    requestVersionsRef.current.clear();
    inFlightKeysRef.current.clear();
    bumpLoading();
  }, [club?.id, companyId, courtMappingKey, durationMinutes, bumpLoading]);

  useEffect(() => {
    void loadDate(
      selectedDate,
      explicitCourtSelection ? normalizedSelectedCourtIds : selectedCourtId ? [selectedCourtId] : null,
    );
  }, [explicitCourtSelection, loadDate, normalizedSelectedCourtIds, selectedCourtId, selectedDate]);

  useEffect(() => {
    if (!enabled || !club) return;
    const today = new Date();
    const todayKey = formatClubDateKey(today, club);
    const selectedKey = formatClubDateKey(selectedDate, club);
    if (todayKey !== selectedKey) {
      void loadDate(
        today,
        explicitCourtSelection ? normalizedSelectedCourtIds : selectedCourtId ? [selectedCourtId] : null,
      );
    }
  }, [club, enabled, explicitCourtSelection, loadDate, normalizedSelectedCourtIds, selectedCourtId, selectedDate]);

  const optionsForDate = useCallback(
    (date: Date, courtId: string | null = null): string[] => {
      void cacheTick;
      if (!club) return [];
      const dateKey = formatClubDateKey(date, club);
      const requestedCourtId = courtId ?? (explicitCourtSelection ? courtSelectionCacheId : selectedCourtId);
      const cacheKey = buildBooktimeOptionsCacheKey(
        dateKey,
        requestedCourtId,
        durationMinutes,
      );
      return cacheRef.current.get(cacheKey) ?? [];
    },
    [cacheTick, club, courtSelectionCacheId, durationMinutes, explicitCourtSelection, selectedCourtId],
  );

  const rowsForDate = useCallback(
    (date: Date, courtId: string | null = null): BooktimeCourtAvailabilityRow[] => {
      void cacheTick;
      if (!club) return [];
      const dateKey = formatClubDateKey(date, club);
      const requestedCourtId = courtId ?? (explicitCourtSelection ? courtSelectionCacheId : selectedCourtId);
      const cacheKey = buildBooktimeOptionsCacheKey(
        dateKey,
        requestedCourtId,
        durationMinutes,
      );
      return rowsCacheRef.current.get(cacheKey) ?? [];
    },
    [cacheTick, club, courtSelectionCacheId, durationMinutes, explicitCourtSelection, selectedCourtId],
  );

  const loading = useMemo(() => {
    void loadingTick;
    if (!club) return false;
    const dateKey = formatClubDateKey(selectedDate, club);
    const cacheKey = buildBooktimeOptionsCacheKey(dateKey, courtSelectionCacheId, durationMinutes);
    return inFlightKeysRef.current.has(cacheKey);
  }, [loadingTick, club, selectedDate, durationMinutes, courtSelectionCacheId]);

  const generateTimeOptions = useCallback(
    () => optionsForDate(selectedDate),
    [optionsForDate, selectedDate],
  );

  const generateTimeOptionsForDate = useCallback(
    (date: Date) => optionsForDate(date),
    [optionsForDate],
  );

  const canAccommodateDuration = useCallback(
    (startTime: string, durHours: number) => {
      if (Math.round(durHours * 60) !== durationMinutes) return false;
      return optionsForDate(selectedDate).includes(startTime);
    },
    [durationMinutes, optionsForDate, selectedDate],
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
    [optionsForDate, selectedDate],
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
    [durationMinutes, optionsForDate, selectedDate],
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
    [],
  );

  const active = enabled && liveApiEnabled && !!club && !!companyId;

  const reload = useCallback(() => {
    if (!club) return;
    const dateKey = formatClubDateKey(selectedDate, club);
    const cacheKey = buildBooktimeOptionsCacheKey(dateKey, courtSelectionCacheId, durationMinutes);
    setCache((prev) => {
      if (!prev.has(cacheKey)) return prev;
      const next = new Map(prev);
      next.delete(cacheKey);
      return next;
    });
    setCacheTick((tick) => tick + 1);
    void loadDate(
      selectedDate,
      explicitCourtSelection ? normalizedSelectedCourtIds : selectedCourtId ? [selectedCourtId] : null,
      { force: true },
    );
  }, [
    club,
    courtSelectionCacheId,
    durationMinutes,
    explicitCourtSelection,
    loadDate,
    normalizedSelectedCourtIds,
    selectedCourtId,
    selectedDate,
  ]);

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
      rowsForDate,
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
      rowsForDate,
    ],
  );
}
