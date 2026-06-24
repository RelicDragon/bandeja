import { useEffect, useMemo, useState } from 'react';
import type { Club, Court, EntityType } from '@/types';
import { BooktimeClient } from '@/integrations/booktime/client';
import { loadBooktimeCompany } from '@/integrations/booktime/bookFlow';
import { resolveBooktimeDurationsHours, resolveClubDurationOptions } from '@/integrations/booktime/durations';
import { getBooktimeCompanyId, shouldUseBooktimeCompanyDurations } from '@shared/clubIntegration';

export type ClubIntegrationDurationsContext = {
  selectedCourtId?: string | null;
  courts?: Court[];
};

export function useClubIntegrationDurations(
  club: Club | undefined,
  entityType: EntityType,
  context?: ClubIntegrationDurationsContext,
) {
  const [integrationDurationsHours, setIntegrationDurationsHours] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(false);

  const companyId = getBooktimeCompanyId(club) ?? undefined;
  const selectedCourtId = context?.selectedCourtId;
  const courts = context?.courts;

  const useBooktimeCompanyDurations = useMemo(
    () => shouldUseBooktimeCompanyDurations(club, selectedCourtId, courts),
    [club, selectedCourtId, courts],
  );

  useEffect(() => {
    if (!companyId) {
      setIntegrationDurationsHours(null);
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
          setIntegrationDurationsHours(resolveBooktimeDurationsHours(company));
        }
      } catch {
        if (!cancelled) {
          setIntegrationDurationsHours(resolveBooktimeDurationsHours(null));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [club?.id, companyId]);

  const durationOptions = useMemo(
    () =>
      resolveClubDurationOptions({
        entityType,
        useBooktimeCompanyDurations,
        integrationDurationsHours,
      }),
    [entityType, useBooktimeCompanyDurations, integrationDurationsHours],
  );

  const usesIntegrationDurations =
    useBooktimeCompanyDurations && (loading || integrationDurationsHours !== null);

  return {
    durationOptions,
    loading: useBooktimeCompanyDurations && loading,
    usesIntegrationDurations,
  };
}
