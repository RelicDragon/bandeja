import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Club, Court } from '@/types';
import {
  type KlikterenAvailabilityClubMeta,
  type KlikterenAvailabilityRawData,
  type KlikterenCourtAvailabilityRow,
  computeCourtAvailabilityRows,
  fetchKlikterenCourtAvailabilityForDate,
  mappedKlikterenCourts,
  resolveKlikterenDateBounds,
} from '@/integrations/klikteren/availability';
import { formatClubDateKey } from '@/integrations/klikteren/slots';
import { getKlikterenVenueId, isKlikterenClub } from '@shared/clubIntegration';

export type UseKlikterenCourtAvailabilityParams = {
  club: Club | undefined;
  courts?: Court[];
  date: Date;
  courtFilter?: string | null;
  durationMinutes: number;
  enabled: boolean;
  loadClubMeta?: boolean;
  klikterenVenueId?: string | null;
};

export function useKlikterenCourtAvailability({
  club,
  courts,
  date,
  courtFilter = null,
  durationMinutes,
  enabled,
  loadClubMeta = false,
  klikterenVenueId: klikterenVenueIdOverride,
}: UseKlikterenCourtAvailabilityParams) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<KlikterenAvailabilityRawData>({
    busyByCourtId: new Map(),
    publicSlotsByExternalId: new Map(),
  });
  const [clubMeta, setClubMeta] = useState<KlikterenAvailabilityClubMeta | null>(null);

  const klikterenVenueId = klikterenVenueIdOverride ?? getKlikterenVenueId(club);
  const dateKey = useMemo(() => (club ? formatClubDateKey(date, club) : ''), [club, date]);
  const mappedCourts = useMemo(
    () => (club ? mappedKlikterenCourts(club, courts) : []),
    [club, courts],
  );

  const load = useCallback(async () => {
    if (!enabled || !club || klikterenVenueId == null) return;
    if (!isKlikterenClub(club)) return;

    setLoading(true);
    setError(null);
    try {
      const result = await fetchKlikterenCourtAvailabilityForDate({
        club,
        klikterenVenueId,
        date,
        durationMinutes,
        loadClubMeta,
      });
      setRaw(result.raw);
      if (result.companyMeta) {
        setClubMeta(result.companyMeta);
      }
    } catch (err) {
      console.error('Klikteren court availability load failed:', err);
      setError('loadFailed');
      setRaw({
        busyByCourtId: new Map(),
        publicSlotsByExternalId: new Map(),
      });
    } finally {
      setLoading(false);
    }
  }, [club, date, durationMinutes, enabled, loadClubMeta, klikterenVenueId]);

  useEffect(() => {
    void load();
  }, [load]);

  const courtRows = useMemo((): KlikterenCourtAvailabilityRow[] => {
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
    if (!club || !clubMeta) return null;
    return resolveKlikterenDateBounds(club, clubMeta.bookableDays);
  }, [club, clubMeta]);

  const active = enabled && !!club && klikterenVenueId != null;

  return {
    active,
    loading,
    error,
    courtRows,
    dateKey,
    reload: load,
    clubMeta,
    minDateKey: dateBounds?.minDateKey ?? (club ? resolveKlikterenDateBounds(club, 7).minDateKey : ''),
    maxDateKey: dateBounds?.maxDateKey ?? '',
  };
}
