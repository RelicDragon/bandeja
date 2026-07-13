import { useEffect, useState } from 'react';
import type { Club } from '@/types';
import { PADELOO_BOOKING_DURATIONS } from '@/integrations/padeloo/config';
import { usePadelooCourtAvailability } from '@/hooks/usePadelooCourtAvailability';
import { getPadelooClubId, isPadelooClub } from '@shared/clubIntegration';

export function usePadelooAvailability(club: Club, selectedDate: Date, enabled: boolean) {
  const [durationMinutes, setDurationMinutes] = useState<number>(PADELOO_BOOKING_DURATIONS[0]);
  const padelooClubId = getPadelooClubId(club);

  const availability = usePadelooCourtAvailability({
    club,
    date: selectedDate,
    durationMinutes,
    enabled: enabled && isPadelooClub(club),
    loadClubMeta: true,
    padelooClubId,
  });

  useEffect(() => {
    if (!availability.clubMeta?.durations?.length) return;
    const durations = availability.clubMeta.durations;
    if (!durations.includes(durationMinutes)) {
      setDurationMinutes(durations[0] ?? PADELOO_BOOKING_DURATIONS[0]);
    }
  }, [availability.clubMeta, durationMinutes]);

  const durations = availability.clubMeta?.durations ?? [...PADELOO_BOOKING_DURATIONS];

  return {
    durationMinutes,
    setDurationMinutes,
    durations,
    loading: availability.loading,
    error: availability.error,
    courtRows: availability.courtRows,
    dateKey: availability.dateKey,
    minDateKey: availability.minDateKey,
    maxDateKey: availability.maxDateKey,
    reload: availability.reload,
  };
}
