import { useEffect, useState } from 'react';
import type { Club } from '@/types';
import type { BooktimeCourtAvailabilityRow } from '@/integrations/booktime/availability';
import { pickDurationAfterMetaLoad } from '@/integrations/booktime/availability';
import { resolveBooktimeDurationsMinutes } from '@/integrations/booktime/durations';
import type { BooktimeBookingDuration } from '@/integrations/booktime/slots';
import { useBooktimeCourtAvailability } from '@/hooks/useBooktimeCourtAvailability';

export type BooktimeCourtAvailability = BooktimeCourtAvailabilityRow;

export function useBooktimeAvailability(
  club: Club,
  companyId: string,
  selectedDate: Date,
  enabled: boolean
) {
  const [durationMinutes, setDurationMinutes] = useState<BooktimeBookingDuration>(60);
  const [durations, setDurations] = useState<BooktimeBookingDuration[]>(() =>
    resolveBooktimeDurationsMinutes(null)
  );

  const availability = useBooktimeCourtAvailability({
    club,
    date: selectedDate,
    durationMinutes,
    enabled,
    loadCompanyMeta: true,
    companyId,
  });

  useEffect(() => {
    if (!availability.companyMeta) return;
    setDurations(availability.companyMeta.durations);
    setDurationMinutes((current) =>
      pickDurationAfterMetaLoad(current, availability.companyMeta!.durations)
    );
  }, [availability.companyMeta]);

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
