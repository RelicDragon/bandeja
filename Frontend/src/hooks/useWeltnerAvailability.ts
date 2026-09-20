import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Club } from '@/types';
import { weltnerApi, type WeltnerAvailability } from '@/api/weltner';
import { formatClubDateKey } from '@/integrations/booktime/slots';
import { clubLocalDateString } from '@/utils/clubAdmin/scheduleTime';

export const WELTNER_DURATIONS = [60, 90, 120, 180];
export function useWeltnerAvailability(
  club: Club | undefined,
  selectedDate: Date,
  enabled: boolean,
) {
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [result, setResult] = useState<{
    key: string;
    data: WeltnerAvailability;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const dateKey = club ? formatClubDateKey(selectedDate, club) : '';
  const clubId = club?.id;
  const key = `${clubId}:${dateKey}`;
  const reload = useCallback(async () => {
    const current = ++sequence.current;
    if (!enabled || !clubId) {
      setResult(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await weltnerApi.availability(clubId, dateKey);
      if (sequence.current === current) setResult({ key: `${clubId}:${dateKey}`, data });
    } catch {
      if (sequence.current === current) {
        setResult(null);
        setError('loadFailed');
      }
    } finally {
      if (sequence.current === current) setLoading(false);
    }
  }, [enabled, clubId, dateKey]);
  useEffect(() => {
    const guard = sequence;
    void reload();
    return () => {
      guard.current++;
    };
  }, [reload]);
  const data = enabled && result?.key === key ? result.data : null;
  const courtRows = useMemo(
    () =>
      (club?.courts ?? [])
        .filter((c) => c.externalCourtId)
        .map((court) => ({
          court,
          freeSlots:
            data?.courts
              .find((c) => c.courtId === court.id)
              ?.slots.filter((s) => s.duration === durationMinutes)
              .map((s) => s.start) ?? [],
        })),
    [club?.courts, data, durationMinutes],
  );
  const minDateKey = club ? clubLocalDateString(club) : '';
  const maxDateKey = minDateKey
    ? new Date(Date.parse(`${minDateKey}T12:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10)
    : '';
  return {
    durationMinutes,
    setDurationMinutes,
    durations: WELTNER_DURATIONS,
    data,
    loading,
    error,
    courtRows,
    dateKey,
    minDateKey,
    maxDateKey,
    reload,
  };
}
