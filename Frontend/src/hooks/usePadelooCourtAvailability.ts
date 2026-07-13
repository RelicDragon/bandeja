import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Club, Court } from '@/types';
import {
  type PadelooAvailabilityClubMeta,
  type PadelooAvailabilityRawData,
  type PadelooCourtAvailabilityRow,
  computeCourtAvailabilityRows,
  fetchPadelooCourtAvailabilityForDate,
  mappedPadelooCourts,
  resolvePadelooDateBounds,
} from '@/integrations/padeloo/availability';
import { formatClubDateKey } from '@/integrations/padeloo/slots';
import { getPadelooClubId, isPadelooClub } from '@shared/clubIntegration';

export type UsePadelooCourtAvailabilityParams = {
  club: Club | undefined;
  courts?: Court[];
  date: Date;
  courtFilter?: string | null;
  durationMinutes: number;
  enabled: boolean;
  loadClubMeta?: boolean;
  padelooClubId?: number | null;
};

export function usePadelooCourtAvailability({
  club,
  courts,
  date,
  courtFilter = null,
  durationMinutes,
  enabled,
  loadClubMeta = false,
  padelooClubId: padelooClubIdOverride,
}: UsePadelooCourtAvailabilityParams) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<PadelooAvailabilityRawData>({
    busyByCourtId: new Map(),
    publicSlotsByExternalId: new Map(),
  });
  const [clubMeta, setClubMeta] = useState<PadelooAvailabilityClubMeta | null>(null);

  const padelooClubId = padelooClubIdOverride ?? getPadelooClubId(club);
  const dateKey = useMemo(() => (club ? formatClubDateKey(date, club) : ''), [club, date]);
  const mappedCourts = useMemo(
    () => (club ? mappedPadelooCourts(club, courts) : []),
    [club, courts],
  );

  const load = useCallback(async () => {
    if (!enabled || !club || padelooClubId == null) return;
    if (!isPadelooClub(club)) return;

    setLoading(true);
    setError(null);
    try {
      const result = await fetchPadelooCourtAvailabilityForDate({
        club,
        padelooClubId,
        date,
        durationMinutes,
        loadClubMeta,
      });
      setRaw(result.raw);
      if (result.companyMeta) {
        setClubMeta(result.companyMeta);
      }
    } catch (err) {
      console.error('Padeloo court availability load failed:', err);
      setError('loadFailed');
      setRaw({
        busyByCourtId: new Map(),
        publicSlotsByExternalId: new Map(),
      });
    } finally {
      setLoading(false);
    }
  }, [club, date, durationMinutes, enabled, loadClubMeta, padelooClubId]);

  useEffect(() => {
    void load();
  }, [load]);

  const courtRows = useMemo((): PadelooCourtAvailabilityRow[] => {
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
    return resolvePadelooDateBounds(club, clubMeta.bookableDays);
  }, [club, clubMeta]);

  const active = enabled && !!club && padelooClubId != null;

  return {
    active,
    loading,
    error,
    courtRows,
    dateKey,
    reload: load,
    clubMeta,
    minDateKey: dateBounds?.minDateKey ?? (club ? resolvePadelooDateBounds(club, 7).minDateKey : ''),
    maxDateKey: dateBounds?.maxDateKey ?? '',
  };
}
