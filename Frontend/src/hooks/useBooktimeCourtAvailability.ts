import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Club, Court } from '@/types';
import {
  type BooktimeAvailabilityCompanyMeta,
  type BooktimeAvailabilityRawData,
  type BooktimeCourtAvailabilityRow,
  computeCourtAvailabilityRows,
  fetchBooktimeCourtAvailabilityForDate,
  mappedBooktimeCourts,
  resolveBooktimeDateBounds,
} from '@/integrations/booktime/availability';
import { formatClubDateKey } from '@/integrations/booktime/slots';
import { useBooktimeLiveApiEnabled } from '@/hooks/useBooktimeLiveApiEnabled';
import { getBooktimeCompanyId, isBooktimeClub } from '@shared/clubIntegration';

export type UseBooktimeCourtAvailabilityParams = {
  club: Club | undefined;
  courts?: Court[];
  date: Date;
  courtFilter?: string | null;
  durationMinutes: number;
  enabled: boolean;
  loadCompanyMeta?: boolean;
  companyId?: string | null;
};

export function useBooktimeCourtAvailability({
  club,
  courts,
  date,
  courtFilter = null,
  durationMinutes,
  enabled,
  loadCompanyMeta = false,
  companyId: companyIdOverride,
}: UseBooktimeCourtAvailabilityParams) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<BooktimeAvailabilityRawData>({
    busyByCourtId: new Map(),
    publicSlotsByExternalId: new Map(),
  });
  const [companyMeta, setCompanyMeta] = useState<BooktimeAvailabilityCompanyMeta | null>(null);

  const companyId = companyIdOverride ?? getBooktimeCompanyId(club);
  const { apiEnabled: liveApiEnabled } = useBooktimeLiveApiEnabled(club?.id, enabled);
  const dateKey = useMemo(() => (club ? formatClubDateKey(date, club) : ''), [club, date]);
  const mappedCourts = useMemo(
    () => (club ? mappedBooktimeCourts(club, courts) : []),
    [club, courts]
  );

  const load = useCallback(async () => {
    if (!enabled || !liveApiEnabled || !club || !companyId) return;
    if (!isBooktimeClub(club)) return;

    setLoading(true);
    setError(null);
    try {
      const result = await fetchBooktimeCourtAvailabilityForDate({
        club,
        companyId,
        date,
        loadCompanyMeta,
      });
      setRaw(result.raw);
      if (result.companyMeta) {
        setCompanyMeta(result.companyMeta);
      }
    } catch (err) {
      console.error('Booktime court availability load failed:', err);
      setError('loadFailed');
      setRaw({
        busyByCourtId: new Map(),
        publicSlotsByExternalId: new Map(),
      });
    } finally {
      setLoading(false);
    }
  }, [club, companyId, date, enabled, liveApiEnabled, loadCompanyMeta]);

  useEffect(() => {
    void load();
  }, [load]);

  const courtRows = useMemo((): BooktimeCourtAvailabilityRow[] => {
    if (!club) return [];
    return computeCourtAvailabilityRows({
      club,
      courts: mappedCourts,
      raw,
      durationMinutes,
      dateKey,
      courtFilter,
    });
  }, [club, courtFilter, dateKey, durationMinutes, mappedCourts, raw]);

  const dateBounds = useMemo(() => {
    if (!club || !companyMeta) return null;
    return resolveBooktimeDateBounds(club, companyMeta.bookableDays);
  }, [club, companyMeta]);

  const active = enabled && liveApiEnabled && !!club && !!companyId;

  return {
    active,
    loading,
    error,
    courtRows,
    dateKey,
    reload: load,
    companyMeta,
    minDateKey: dateBounds?.minDateKey ?? (club ? resolveBooktimeDateBounds(club, 14).minDateKey : ''),
    maxDateKey: dateBounds?.maxDateKey ?? '',
  };
}
