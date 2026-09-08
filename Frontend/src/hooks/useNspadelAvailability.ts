import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Club } from '@/types';
import { createScoutNspadelClubBookingProvider } from '@/integrations/booking/createClubBookingProvider';
import { formatClubDateKey } from '@/integrations/booktime/slots';
import { getNspadelSupabaseUrl, isNspadelClub } from '@shared/clubIntegration';
import { NSPADEL_BOOKING_DURATIONS } from '@/integrations/nspadel/config';
import {
  computeNspadelCourtAvailabilityRows,
  mappedNspadelCourts,
  resolveNspadelDateBounds,
} from '@/integrations/nspadel/availability';

export function useNspadelAvailability(club: Club, selectedDate: Date, enabled: boolean) {
  const [durationMinutes, setDurationMinutes] = useState<number>(NSPADEL_BOOKING_DURATIONS[0] ?? 60);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [courtRows, setCourtRows] = useState<
    ReturnType<typeof computeNspadelCourtAvailabilityRows>
  >([]);

  const dateKey = useMemo(() => formatClubDateKey(selectedDate, club), [selectedDate, club]);
  const courts = useMemo(() => mappedNspadelCourts(club), [club]);
  const bounds = useMemo(() => resolveNspadelDateBounds(club), [club]);

  const load = useCallback(async () => {
    if (!enabled || !isNspadelClub(club) || !getNspadelSupabaseUrl(club)) return;
    setLoading(true);
    setError(null);
    try {
      const provider = createScoutNspadelClubBookingProvider(club, durationMinutes);
      const snapshotCourts = await provider.fetchSnapshotCourts(selectedDate, dateKey);
      setCourtRows(
        computeNspadelCourtAvailabilityRows({
          club,
          courts,
          snapshotCourts,
          durationMinutes,
          dateKey,
        }),
      );
    } catch (err) {
      console.error('NS Padel availability load failed:', err);
      setError('loadFailed');
      setCourtRows([]);
    } finally {
      setLoading(false);
    }
  }, [club, courts, dateKey, durationMinutes, enabled, selectedDate]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    durationMinutes,
    setDurationMinutes,
    durations: [...NSPADEL_BOOKING_DURATIONS],
    loading,
    error,
    courtRows,
    dateKey,
    minDateKey: bounds.minDateKey,
    maxDateKey: bounds.maxDateKey,
    reload: load,
  };
}
