import { useEffect, useMemo, useState } from 'react';
import type { Club, EntityType } from '@/types';
import { BooktimeClient } from '@/integrations/booktime/client';
import { loadBooktimeCompany } from '@/integrations/booktime/bookFlow';
import {
  DEFAULT_GAME_DURATIONS_HOURS,
  DEFAULT_TOURNAMENT_DURATIONS_HOURS,
  resolveBooktimeDurationsHours,
} from '@/integrations/booktime/durations';
import { getBooktimeCompanyId } from '@shared/clubIntegration';

function defaultDurationOptions(entityType: EntityType): number[] {
  if (entityType === 'TOURNAMENT') return [...DEFAULT_TOURNAMENT_DURATIONS_HOURS];
  return [...DEFAULT_GAME_DURATIONS_HOURS];
}

export function useClubIntegrationDurations(club: Club | undefined, entityType: EntityType) {
  const [integrationDurationsHours, setIntegrationDurationsHours] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(false);

  const companyId = getBooktimeCompanyId(club) ?? undefined;

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

  const durationOptions = useMemo(() => {
    if (integrationDurationsHours) return integrationDurationsHours;
    return defaultDurationOptions(entityType);
  }, [integrationDurationsHours, entityType]);

  const usesIntegrationDurations = !!integrationDurationsHours;

  return { durationOptions, loading, usesIntegrationDurations };
}
