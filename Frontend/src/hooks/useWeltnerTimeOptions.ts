import { useCallback, useMemo } from 'react';
import type { Club, Court } from '@/types';
import { useWeltnerAvailability } from './useWeltnerAvailability';
import { formatClubDateKey } from '@/integrations/booktime/slots';

export function useWeltnerTimeOptions(params: {
  club: Club | undefined;
  courts?: Court[];
  selectedDate: Date;
  durationHours: number;
  selectedCourtId: string | null;
  selectedCourtIds?: string[];
  enabled: boolean;
}) {
  const { club, enabled, durationHours } = params;
  const availability = useWeltnerAvailability(club, params.selectedDate, enabled);
  const { data, dateKey, loading, reload } = availability;
  const selected =
    params.selectedCourtIds ??
    (params.selectedCourtId && params.selectedCourtId !== 'notBooked'
      ? [params.selectedCourtId]
      : []);
  const selectionKey = [...new Set(selected.filter((id) => id !== 'notBooked'))].sort().join('|');
  const courtFilterKey = params.courts
    ?.map((c) => c.id)
    .sort()
    .join('|');
  const options = useMemo(() => {
    const ids = selectionKey ? selectionKey.split('|') : [];
    const courtFilter = courtFilterKey?.split('|');
    const rows =
      data?.courts.filter(
        (c) =>
          (!courtFilter || courtFilter.includes(c.courtId)) &&
          (!ids.length || ids.includes(c.courtId)),
      ) ?? [];
    if (!rows.length || (ids.length && rows.length !== ids.length)) return [];
    const lists = rows.map((c) =>
      c.slots.filter((s) => s.duration === Math.round(durationHours * 60)).map((s) => s.start),
    );
    return [...new Set(lists[0])].filter((s) => lists.every((list) => list.includes(s))).sort();
  }, [data, selectionKey, durationHours, courtFilterKey]);
  const generateTimeOptions = useCallback(() => options, [options]);
  const generateTimeOptionsForDate = useCallback(
    (date: Date) => (club && formatClubDateKey(date, club) === dateKey ? options : []),
    [club, dateKey, options],
  );
  const canAccommodateDuration = useCallback(
    (start: string, hours: number) => hours === durationHours && options.includes(start),
    [durationHours, options],
  );
  const getAdjustedStartTime = useCallback(
    (start: string, hours: number) => (canAccommodateDuration(start, hours) ? start : null),
    [canAccommodateDuration],
  );
  const getTimeSlotsForDuration = useCallback(
    (start: string, hours: number) => (canAccommodateDuration(start, hours) ? [start] : []),
    [canAccommodateDuration],
  );
  const isSlotHighlighted = useCallback((time: string, start: string) => time === start, []);
  const rowsForDate = useCallback(() => [], []);
  return useMemo(
    () => ({
      active: enabled && !!club,
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
      enabled,
      club,
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
