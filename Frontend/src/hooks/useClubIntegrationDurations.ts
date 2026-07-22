import { useEffect, useMemo, useState } from 'react';
import type { Club, Court, EntityType } from '@/types';
import { BooktimeClient } from '@/integrations/booktime/client';
import { loadBooktimeCompany } from '@/integrations/booktime/bookFlow';
import {
  minutesToDurationHours,
  resolveBooktimeDurationsHours,
  resolveClubDurationOptions,
} from '@/integrations/booktime/durations';
import { PADELOO_BOOKING_DURATIONS } from '@/integrations/padeloo/config';
import { KLIKTEREN_BOOKING_DURATIONS } from '@/integrations/klikteren/config';
import {
  getBooktimeCompanyId,
  shouldUseBooktimeCompanyDurations,
  shouldUseKlikterenDurations,
  shouldUsePadelooDurations,
} from '@shared/clubIntegration';

export type ClubIntegrationDurationsContext = {
  selectedCourtId?: string | null;
  courts?: Court[];
};

export function useClubIntegrationDurations(
  club: Club | undefined,
  entityType: EntityType,
  context?: ClubIntegrationDurationsContext,
) {
  const [booktimeDurationsHours, setBooktimeDurationsHours] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(false);

  const companyId = getBooktimeCompanyId(club) ?? undefined;
  const selectedCourtId = context?.selectedCourtId;
  const courts = context?.courts;

  const useBooktimeCompanyDurations = useMemo(
    () => shouldUseBooktimeCompanyDurations(club, selectedCourtId, courts),
    [club, selectedCourtId, courts],
  );
  const usePadelooDurations = useMemo(
    () => shouldUsePadelooDurations(club, selectedCourtId, courts),
    [club, selectedCourtId, courts],
  );
  const useKlikterenDurations = useMemo(
    () => shouldUseKlikterenDurations(club, selectedCourtId, courts),
    [club, selectedCourtId, courts],
  );

  const useIntegrationDurations =
    useBooktimeCompanyDurations || usePadelooDurations || useKlikterenDurations;

  useEffect(() => {
    if (!useBooktimeCompanyDurations || !companyId) {
      setBooktimeDurationsHours(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const client = new BooktimeClient({ companyId });
        const company = await loadBooktimeCompany(client, companyId);
        if (!cancelled) {
          setBooktimeDurationsHours(resolveBooktimeDurationsHours(company));
        }
      } catch {
        if (!cancelled) {
          setBooktimeDurationsHours(resolveBooktimeDurationsHours(null));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [club?.id, companyId, useBooktimeCompanyDurations]);

  const integrationDurationsHours = useMemo(() => {
    if (useKlikterenDurations) {
      return KLIKTEREN_BOOKING_DURATIONS.map(minutesToDurationHours);
    }
    if (usePadelooDurations) {
      return PADELOO_BOOKING_DURATIONS.map(minutesToDurationHours);
    }
    if (useBooktimeCompanyDurations) {
      return booktimeDurationsHours;
    }
    return null;
  }, [
    booktimeDurationsHours,
    useBooktimeCompanyDurations,
    useKlikterenDurations,
    usePadelooDurations,
  ]);

  const durationOptions = useMemo(
    () =>
      resolveClubDurationOptions({
        entityType,
        useBooktimeCompanyDurations: useIntegrationDurations,
        integrationDurationsHours,
      }),
    [entityType, useIntegrationDurations, integrationDurationsHours],
  );

  const usesIntegrationDurations =
    useIntegrationDurations &&
    (useKlikterenDurations ||
      usePadelooDurations ||
      loading ||
      booktimeDurationsHours !== null);

  return {
    durationOptions,
    loading: useBooktimeCompanyDurations && loading,
    usesIntegrationDurations,
  };
}
