import { useEffect, useState } from 'react';
import type { Club } from '@/types';
import { KLIKTEREN_BOOKING_DURATIONS } from '@/integrations/klikteren/config';
import { useKlikterenCourtAvailability } from '@/hooks/useKlikterenCourtAvailability';
import { getKlikterenVenueId, isKlikterenClub } from '@shared/clubIntegration';

export function useKlikterenAvailability(club: Club, selectedDate: Date, enabled: boolean) {
  const [durationMinutes, setDurationMinutes] = useState<number>(KLIKTEREN_BOOKING_DURATIONS[0]);
  const klikterenVenueId = getKlikterenVenueId(club);

  const availability = useKlikterenCourtAvailability({
    club,
    date: selectedDate,
    durationMinutes,
    enabled: enabled && isKlikterenClub(club),
    loadClubMeta: true,
    klikterenVenueId,
  });

  useEffect(() => {
    if (!availability.clubMeta?.durations?.length) return;
    const durations = availability.clubMeta.durations;
    if (!durations.includes(durationMinutes)) {
      setDurationMinutes(durations[0] ?? KLIKTEREN_BOOKING_DURATIONS[0]);
    }
  }, [availability.clubMeta, durationMinutes]);

  const durations = availability.clubMeta?.durations ?? [...KLIKTEREN_BOOKING_DURATIONS];

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
