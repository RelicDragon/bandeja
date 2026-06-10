import { useCallback, useEffect, useMemo, useState } from 'react';
import { booktimeApi } from '@/api/booktime';
import type { Club, Court } from '@/types';
import { BooktimeClient } from '@/integrations/booktime/client';
import {
  BOOKTIME_BOOKING_DURATIONS,
  type BooktimeBookingDuration,
  computeFreeSlotsForCourt,
  formatClubDateKey,
} from '@/integrations/booktime/slots';
import { clubLocalDateString, clubLocalNowMinutes } from '@/utils/clubAdmin/scheduleTime';

export type BooktimeCourtAvailability = {
  court: Court;
  externalCourtId: string;
  freeSlots: string[];
};

const BOOKABLE_DAYS = 14;

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publicSlotsByExternalId, setPublicSlotsByExternalId] = useState<Map<string, string[]>>(new Map());
  const [busyByCourtId, setBusyByCourtId] = useState<Map<string, Array<{ startTime: string; endTime: string }>>>(
    new Map()
  );

  const dateKey = useMemo(() => formatClubDateKey(selectedDate, club), [selectedDate, club]);
  const courts = useMemo(() => mappedCourts(club), [club]);

  const load = useCallback(async () => {
    if (!enabled || club.integrationType !== 'BOOKTIME') return;
    setLoading(true);
    setError(null);
    try {
      const [snapshotRes, slotsRes] = await Promise.all([
        booktimeApi.getSnapshot(club.id, dateKey),
        new BooktimeClient({ companyId }).getAvailableSlots(selectedDate),
      ]);

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
      console.error('BookTime availability load failed:', err);
      setError('loadFailed');
      setPublicSlotsByExternalId(new Map());
      setBusyByCourtId(new Map());
    } finally {
      setLoading(false);
    }
  }, [club.id, club.integrationType, companyId, dateKey, enabled, selectedDate]);

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
    const max = new Date();
    max.setDate(max.getDate() + BOOKABLE_DAYS - 1);
    return formatClubDateKey(max, club);
  }, [club]);

  return {
    durationMinutes,
    setDurationMinutes,
    durations: BOOKTIME_BOOKING_DURATIONS,
    loading,
    error,
    courtRows,
    dateKey,
    minDateKey,
    maxDateKey,
    reload: load,
  };
}
