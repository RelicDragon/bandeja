import { useCallback, useEffect, useMemo, useState } from 'react';
import { booktimeApi } from '@/api/booktime';
import type { Club, Court } from '@/types';
import { BooktimeClient } from '@/integrations/booktime/client';
import { computeFreeSlotsForCourt, formatClubDateKey } from '@/integrations/booktime/slots';
import { clubLocalDateString, clubLocalNowMinutes } from '@/utils/clubAdmin/scheduleTime';
import { useBooktimeLiveApiEnabled } from '@/hooks/useBooktimeLiveApiEnabled';

type OptionsCache = Map<string, string[]>;

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

function parseMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function booktimeCompanyId(club: Club): string | null {
  const companyId = club.integrationConfig?.companyId;
  return typeof companyId === 'string' && companyId.trim() ? companyId.trim() : null;
}

type UseBooktimeTimeOptionsParams = {
  club: Club | undefined;
  courts?: Court[];
  selectedDate: Date;
  durationHours: number;
  selectedCourtId: string | null;
  enabled: boolean;
};

export function useBooktimeTimeOptions({
  club,
  courts,
  selectedDate,
  durationHours,
  selectedCourtId,
  enabled,
}: UseBooktimeTimeOptionsParams) {
  const [cache, setCache] = useState<OptionsCache>(new Map());
  const [loading, setLoading] = useState(false);
  const { apiEnabled: liveApiEnabled } = useBooktimeLiveApiEnabled(club?.id, enabled);

  const durationMinutes = Math.round(durationHours * 60);
  const companyId = club ? booktimeCompanyId(club) : null;

  const loadDate = useCallback(
    async (date: Date) => {
      if (!enabled || !liveApiEnabled || !club || !companyId) return;
      const dateKey = formatClubDateKey(date, club);
      setLoading(true);
      try {
        const client = new BooktimeClient({ companyId });
        const [snapshotRes, slotsRes] = await Promise.all([
          booktimeApi.getSnapshot(club.id, dateKey),
          client.getAvailableSlots(date, dateKey),
        ]);

        const busyByCourtId = new Map<string, Array<{ startTime: string; endTime: string }>>();
        for (const row of snapshotRes.data?.courts ?? []) {
          if (row.courtId) {
            busyByCourtId.set(row.courtId, row.busySlots ?? []);
          }
        }

        const mappedCourts = (courts ?? club.courts ?? []).filter(
          (c) => typeof c.externalCourtId === 'string' && c.externalCourtId.trim()
        );

        let raw: string[];

        if (selectedCourtId) {
          const court = mappedCourts.find((c) => c.id === selectedCourtId);
          const externalCourtId = court?.externalCourtId?.trim();
          const courtRow = externalCourtId
            ? slotsRes?.find((row) => row.uuid === externalCourtId)
            : undefined;
          raw = computeFreeSlotsForCourt(
            courtRow?.availableSlots ?? [],
            busyByCourtId.get(selectedCourtId) ?? [],
            durationMinutes,
            club,
            dateKey
          );
        } else {
          const freeStarts = new Set<string>();
          for (const court of mappedCourts) {
            const externalCourtId = court.externalCourtId!.trim();
            const courtRow = slotsRes?.find((row) => row.uuid === externalCourtId);
            for (const start of computeFreeSlotsForCourt(
              courtRow?.availableSlots ?? [],
              busyByCourtId.get(court.id) ?? [],
              durationMinutes,
              club,
              dateKey
            )) {
              freeStarts.add(start);
            }
          }
          raw = [...freeStarts].sort((a, b) => parseMinutes(a) - parseMinutes(b));
        }
        const options = filterPastSlots(raw, dateKey, club);

        setCache((prev) => {
          const next = new Map(prev);
          next.set(dateKey, options);
          return next;
        });
      } catch (err) {
        console.error('Booktime time options load failed:', err);
        setCache((prev) => {
          const next = new Map(prev);
          next.set(dateKey, []);
          return next;
        });
      } finally {
        setLoading(false);
      }
    },
    [club, companyId, courts, durationMinutes, enabled, liveApiEnabled, selectedCourtId]
  );

  useEffect(() => {
    setCache(new Map());
  }, [club?.id, companyId, selectedCourtId, courts]);

  useEffect(() => {
    void loadDate(selectedDate);
  }, [loadDate, selectedDate]);

  useEffect(() => {
    if (!enabled || !club) return;
    const today = new Date();
    const todayKey = formatClubDateKey(today, club);
    const selectedKey = formatClubDateKey(selectedDate, club);
    if (todayKey !== selectedKey) {
      void loadDate(today);
    }
  }, [club, enabled, loadDate, selectedDate]);

  const optionsForDate = useCallback(
    (date: Date): string[] => {
      if (!club) return [];
      const dateKey = formatClubDateKey(date, club);
      return cache.get(dateKey) ?? [];
    },
    [cache, club]
  );

  const generateTimeOptions = useCallback(
    () => optionsForDate(selectedDate),
    [optionsForDate, selectedDate]
  );

  const generateTimeOptionsForDate = optionsForDate;

  const canAccommodateDuration = useCallback(
    (startTime: string, durHours: number) => {
      if (Math.round(durHours * 60) !== durationMinutes) return false;
      return optionsForDate(selectedDate).includes(startTime);
    },
    [durationMinutes, optionsForDate, selectedDate]
  );

  const getTimeSlotsForDuration = useCallback(
    (startTime: string, durHours: number) => {
      const options = optionsForDate(selectedDate);
      const startMin = parseMinutes(startTime);
      const endMin = startMin + Math.round(durHours * 60);
      return options.filter((time) => {
        const t = parseMinutes(time);
        return t >= startMin && t < endMin;
      });
    },
    [optionsForDate, selectedDate]
  );

  const getAdjustedStartTime = useCallback(
    (clickedTime: string, durHours: number) => {
      if (Math.round(durHours * 60) !== durationMinutes) return null;
      const options = optionsForDate(selectedDate);
      const clickedMin = parseMinutes(clickedTime);
      const matches = options.filter((start) => {
        const startMin = parseMinutes(start);
        return startMin <= clickedMin && clickedMin < startMin + durationMinutes;
      });
      return matches.length > 0 ? matches[matches.length - 1]! : null;
    },
    [durationMinutes, optionsForDate, selectedDate]
  );

  const isSlotHighlighted = useCallback(
    (time: string, selectedTime: string, durHours: number) => {
      if (!selectedTime) return false;
      const startMin = parseMinutes(selectedTime);
      const endMin = startMin + Math.round(durHours * 60);
      const t = parseMinutes(time);
      return t >= startMin && t < endMin;
    },
    []
  );

  const active = enabled && liveApiEnabled && !!club && !!companyId;

  return useMemo(
    () => ({
      active,
      loading,
      generateTimeOptions,
      generateTimeOptionsForDate,
      canAccommodateDuration,
      getAdjustedStartTime,
      getTimeSlotsForDuration,
      isSlotHighlighted,
    }),
    [
      active,
      loading,
      generateTimeOptions,
      generateTimeOptionsForDate,
      canAccommodateDuration,
      getAdjustedStartTime,
      getTimeSlotsForDuration,
      isSlotHighlighted,
    ]
  );
}
