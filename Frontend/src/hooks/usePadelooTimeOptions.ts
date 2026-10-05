import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Club, Court } from '@/types';
import {
  computeCourtAvailabilityRows,
  fetchPadelooCourtAvailabilityForDate,
  mappedPadelooCourts,
  parseSlotMinutes,
} from '@/integrations/padeloo/availability';
import {
  intersectFreeSlotStarts,
} from '@/integrations/booktime/availability';
import { getPadelooClubId, isPadelooClub } from '@shared/clubIntegration';

type UsePadelooTimeOptionsParams = {
  club: Club | undefined;
  courts?: Court[];
  selectedDate: Date;
  durationHours: number;
  selectedCourtId: string | null;
  selectedCourtIds?: string[];
  enabled: boolean;
};

const EMPTY_OPTIONS: string[] = [];

export function usePadelooTimeOptions({
  club,
  courts,
  selectedDate,
  durationHours,
  selectedCourtId,
  selectedCourtIds,
  enabled,
}: UsePadelooTimeOptionsParams) {
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const durationMinutes = Math.round(durationHours * 60);
  const padelooClubId = getPadelooClubId(club);

  // Keyed by content: callers may pass a fresh array every render, and an
  // identity-keyed memo would re-run `load` (and its setState) on each one.
  const selectedCourtIdsKey = [
    ...new Set(
      (selectedCourtIds ?? (selectedCourtId ? [selectedCourtId] : [])).filter((id) => id && id !== 'notBooked'),
    ),
  ]
    .sort()
    .join(',');
  const normalizedSelectedCourtIds = useMemo(
    () => (selectedCourtIdsKey ? selectedCourtIdsKey.split(',') : []),
    [selectedCourtIdsKey],
  );

  const load = useCallback(async () => {
    if (!enabled || !club || !isPadelooClub(club) || padelooClubId == null) {
      setOptions(EMPTY_OPTIONS);
      return;
    }
    setLoading(true);
    try {
      const { raw, dateKey } = await fetchPadelooCourtAvailabilityForDate({
        club,
        padelooClubId,
        date: selectedDate,
        durationMinutes,
      });
      const mappedCourts = mappedPadelooCourts(club, courts);
      const rows = computeCourtAvailabilityRows({
        club,
        courts: mappedCourts,
        raw,
        durationMinutes,
        dateKey,
        courtFilter: null,
      });
      const filteredRows =
        normalizedSelectedCourtIds.length > 0
          ? rows.filter((row) => normalizedSelectedCourtIds.includes(row.court.id))
          : selectedCourtId && selectedCourtId !== 'notBooked'
            ? rows.filter((row) => row.court.id === selectedCourtId)
            : rows;
      const freeLists = filteredRows.map((row) => row.freeSlots);
      const merged =
        freeLists.length === 0
          ? []
          : freeLists.length === 1
            ? [...new Set(freeLists[0])].sort()
            : intersectFreeSlotStarts(filteredRows);
      setOptions(merged);
    } catch {
      setOptions(EMPTY_OPTIONS);
    } finally {
      setLoading(false);
    }
  }, [
    club,
    courts,
    durationMinutes,
    enabled,
    normalizedSelectedCourtIds,
    padelooClubId,
    selectedCourtId,
    selectedDate,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const generateTimeOptions = useCallback(() => options, [options]);

  const generateTimeOptionsForDate = useCallback(
    (_date: Date) => options,
    [options],
  );

  const canAccommodateDuration = useCallback(
    (startTime: string, durHours: number) =>
      Math.round(durHours * 60) === durationMinutes && options.includes(startTime),
    [durationMinutes, options],
  );

  const getAdjustedStartTime = useCallback(
    (clickedTime: string, durHours: number) => {
      if (Math.round(durHours * 60) !== durationMinutes) return null;
      const clickedMin = parseSlotMinutes(clickedTime);
      if (clickedMin == null) return null;
      const matches = options.filter((start) => {
        const startMin = parseSlotMinutes(start);
        return startMin != null && startMin <= clickedMin && clickedMin < startMin + durationMinutes;
      });
      return matches.length > 0 ? matches[matches.length - 1]! : null;
    },
    [durationMinutes, options],
  );

  const getTimeSlotsForDuration = useCallback(
    (startTime: string, durHours: number) => {
      const startMin = parseSlotMinutes(startTime) ?? 0;
      const endMin = startMin + Math.round(durHours * 60);
      return options.filter((time) => {
        const t = parseSlotMinutes(time);
        return t != null && t >= startMin && t < endMin;
      });
    },
    [options],
  );

  const isSlotHighlighted = useCallback(
    (time: string, selected: string, durHours: number) => {
      if (!selected) return false;
      const startMin = parseSlotMinutes(selected);
      const t = parseSlotMinutes(time);
      if (startMin == null || t == null) return false;
      const endMin = startMin + Math.round(durHours * 60);
      return t >= startMin && t < endMin;
    },
    [],
  );

  const rowsForDate = useCallback(() => [], []);

  const active = enabled && !!club && padelooClubId != null;

  return useMemo(
    () => ({
      active,
      loading,
      reload: load,
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
      load,
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
