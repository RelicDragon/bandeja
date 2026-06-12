import { useCallback, useEffect, useMemo, useState } from 'react';
import { booktimeApi } from '@/api/booktime';
import type { Club, Court } from '@/types';
import { BooktimeClient } from '@/integrations/booktime/client';
import { useBooktimeLiveApiEnabled } from '@/hooks/useBooktimeLiveApiEnabled';
import { loadBooktimeCompany } from '@/integrations/booktime/bookFlow';
import {
  pickClosestDurationOption,
  resolveBooktimeDurationsMinutes,
} from '@/integrations/booktime/durations';
import {
  type BooktimeBookingDuration,
  computeFreeSlotsForCourt,
  formatClubDateKey,
} from '@/integrations/booktime/slots';
import { clubLocalDateString, clubLocalNowMinutes } from '@/utils/clubAdmin/scheduleTime';
import { DEFAULT_BOOKABLE_DAYS } from '@/hooks/useBooktimeCompanyMeta';

export type BooktimeCourtAvailability = {
  court: Court;
  externalCourtId: string;
  freeSlots: string[];
};

function mappedCourts(club: Club): Court[] {
  return (club.courts ?? [])
    .filter((c) => typeof c.externalCourtId === 'string' && c.externalCourtId.trim())
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function filterPastSlots(slotStarts: string[], dateKey: string, club: Club): string[] {
  const todayKey = clubLocalDateString(club);
  if (dateKey !== todayKey) return slotStarts;
  const nowMinutes = clubLocalNowMinutes(club);
  return slotStarts.filter((start) => {
    const [h, m] = start.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return false;
    return h * 60 + m >= nowMinutes;
  });
}

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publicSlotsByExternalId, setPublicSlotsByExternalId] = useState<Map<string, string[]>>(new Map());
  const [busyByCourtId, setBusyByCourtId] = useState<Map<string, Array<{ startTime: string; endTime: string }>>>(
    new Map()
  );
  const [bookableDays, setBookableDays] = useState(DEFAULT_BOOKABLE_DAYS);
  const { apiEnabled: liveApiEnabled } = useBooktimeLiveApiEnabled(club.id, enabled);

  const dateKey = useMemo(() => formatClubDateKey(selectedDate, club), [selectedDate, club]);
  const courts = useMemo(() => mappedCourts(club), [club]);

  const load = useCallback(async () => {
    if (!enabled || !liveApiEnabled || club.integrationType !== 'BOOKTIME') return;
    setLoading(true);
    setError(null);
    try {
      const client = new BooktimeClient({ companyId });
      const [snapshotRes, slotsRes, company] = await Promise.all([
        booktimeApi.getSnapshot(club.id, dateKey),
        client.getAvailableSlots(selectedDate, dateKey),
        loadBooktimeCompany(client, companyId),
      ]);

      const resolvedDurations = resolveBooktimeDurationsMinutes(company);
      setDurations(resolvedDurations);
      setDurationMinutes((current) => pickClosestDurationOption(current, resolvedDurations));
      if (typeof company.bookableDays === 'number' && company.bookableDays > 0) {
        setBookableDays(company.bookableDays);
      } else {
        setBookableDays(DEFAULT_BOOKABLE_DAYS);
      }

      const busyMap = new Map<string, Array<{ startTime: string; endTime: string }>>();
      for (const row of snapshotRes.data?.courts ?? []) {
        if (row.courtId) {
          busyMap.set(row.courtId, row.busySlots ?? []);
        }
      }
      setBusyByCourtId(busyMap);

      const publicMap = new Map<string, string[]>();
      for (const row of slotsRes ?? []) {
        if (typeof row.uuid === 'string' && row.uuid.trim()) {
          publicMap.set(row.uuid.trim(), row.availableSlots ?? []);
        }
      }
      setPublicSlotsByExternalId(publicMap);
    } catch (err) {
      console.error('Club booking availability load failed:', err);
      setError('loadFailed');
      setPublicSlotsByExternalId(new Map());
      setBusyByCourtId(new Map());
    } finally {
      setLoading(false);
    }
  }, [club.id, club.integrationType, companyId, dateKey, enabled, liveApiEnabled, selectedDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const courtRows = useMemo((): BooktimeCourtAvailability[] => {
    return courts.map((court) => {
      const externalCourtId = court.externalCourtId!.trim();
      const ranges = publicSlotsByExternalId.get(externalCourtId) ?? [];
      const busy = busyByCourtId.get(court.id) ?? [];
      const freeSlots = filterPastSlots(
        computeFreeSlotsForCourt(ranges, busy, durationMinutes, club, dateKey),
        dateKey,
        club
      );
      return { court, externalCourtId, freeSlots };
    });
  }, [busyByCourtId, club, courts, dateKey, durationMinutes, publicSlotsByExternalId]);

  const minDateKey = useMemo(() => clubLocalDateString(club), [club]);
  const maxDateKey = useMemo(() => {
    const todayKey = clubLocalDateString(club);
    const [y, m, d] = todayKey.split('-').map(Number);
    const max = new Date(y, m - 1, d + bookableDays - 1, 12, 0, 0);
    return formatClubDateKey(max, club);
  }, [bookableDays, club]);

  return {
    durationMinutes,
    setDurationMinutes,
    durations,
    loading,
    error,
    courtRows,
    dateKey,
    minDateKey,
    maxDateKey,
    reload: load,
  };
}
