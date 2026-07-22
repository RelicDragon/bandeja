import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Club, Court } from '@/types';
import {
  computeCourtAvailabilityRows,
  fetchKlikterenCourtAvailabilityForDate,
  mappedKlikterenCourts,
  parseSlotMinutes,
} from '@/integrations/klikteren/availability';
import {
  intersectFreeSlotStarts,
} from '@/integrations/booktime/availability';
import { getKlikterenVenueId, isKlikterenClub } from '@shared/clubIntegration';

type UseKlikterenTimeOptionsParams = {
  club: Club | undefined;
  courts?: Court[];
  selectedDate: Date;
  durationHours: number;
  selectedCourtId: string | null;
  selectedCourtIds?: string[];
  enabled: boolean;
};

export function useKlikterenTimeOptions({
  club,
  courts,
  selectedDate,
  durationHours,
  selectedCourtId,
  selectedCourtIds,
  enabled,
}: UseKlikterenTimeOptionsParams) {
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const durationMinutes = Math.round(durationHours * 60);
  const klikterenClubId = getKlikterenVenueId(club);

  const normalizedSelectedCourtIds = useMemo(() => {
    const source = selectedCourtIds ?? (selectedCourtId ? [selectedCourtId] : []);
    return [...new Set(source.filter((id) => id && id !== 'notBooked'))].sort();
  }, [selectedCourtId, selectedCourtIds]);

  const load = useCallback(async () => {
    if (!enabled || !club || !isKlikterenClub(club) || klikterenClubId == null) {
      setOptions([]);
      return;
    }
    setLoading(true);
    try {
      const { raw, dateKey } = await fetchKlikterenCourtAvailabilityForDate({
        club,
        klikterenClubId,
        date: selectedDate,
        durationMinutes,
      });
      const mappedCourts = mappedKlikterenCourts(club, courts);
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
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [
    club,
    courts,
    durationMinutes,
    enabled,
    normalizedSelectedCourtIds,
    klikterenClubId,
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

  const active = enabled && !!club && klikterenClubId != null;

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
