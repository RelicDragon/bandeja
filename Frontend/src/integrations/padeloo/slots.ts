import type { Club } from '@/types';
import { getClubTimezone } from '@/hooks/useGameTimeDuration';
import { booktimeLocalIsoToDate } from '@/integrations/booktime/localTime';
import { BOOKTIME_SNAPSHOT_FRESH_MS } from '@shared/gameBooking/booktimeSnapshotFreshness';
import type { PadelooAvailableCourtRow } from './client';
import { PADELOO_BOOKING_DURATIONS, PADELOO_DEFAULT_WORKING_HOURS } from './config';

export const PADELOO_CONFIRM_RECHECK_MS = 60 * 1000;
export const PADELOO_SLOT_STEP_MINUTES = 60;
export { PADELOO_BOOKING_DURATIONS };
export type PadelooBookingDuration = number;

export type PadelooBusyInterval = {
  startTime: string;
  endTime: string;
};

export type PadelooSnapshotCourtPayload = {
  courtId: string | null;
  externalCourtId: string;
  externalCourtName?: string | null;
  busySlots: PadelooBusyInterval[];
};

type MinutesRange = { start: number; end: number };

export function formatClubDateKey(date: Date, club?: Club): string {
  const tz = getClubTimezone(club);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function isSnapshotStale(fetchedAt: string | null | undefined, nowMs = Date.now()): boolean {
  if (!fetchedAt) return true;
  const ts = new Date(fetchedAt).getTime();
  if (Number.isNaN(ts)) return true;
  return nowMs - ts >= BOOKTIME_SNAPSHOT_FRESH_MS;
}

export function isSnapshotOlderThan(
  fetchedAt: string | null | undefined,
  maxAgeMs: number,
  nowMs = Date.now(),
): boolean {
  if (!fetchedAt) return true;
  const ts = new Date(fetchedAt).getTime();
  if (Number.isNaN(ts)) return true;
  return nowMs - ts >= maxAgeMs;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function parseTimeLabelToMinutes(time: string): number | null {
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function minutesToTimeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function mergeMinuteRanges(ranges: MinutesRange[]): MinutesRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: MinutesRange[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

function slotsToMergedRanges(
  slots: Array<{ startTime: string; endTime: string }>,
): MinutesRange[] {
  const parsed = slots
    .map((slot) => {
      const start = parseTimeLabelToMinutes(slot.startTime);
      const end = parseTimeLabelToMinutes(slot.endTime);
      if (start == null || end == null || end <= start) return null;
      return { start, end };
    })
    .filter((range): range is MinutesRange => range != null);
  return mergeMinuteRanges(parsed);
}

function minutesToBusyInterval(
  dateKey: string,
  startMinutes: number,
  endMinutes: number,
  club: Club,
): PadelooBusyInterval | null {
  if (endMinutes <= startMinutes) return null;
  const tz = getClubTimezone(club);
  const sh = Math.floor(startMinutes / 60);
  const sm = startMinutes % 60;
  const eh = Math.floor(endMinutes / 60);
  const em = endMinutes % 60;
  const start = booktimeLocalIsoToDate(`${dateKey}T${pad2(sh)}:${pad2(sm)}:00`, tz);
  const end = booktimeLocalIsoToDate(`${dateKey}T${pad2(eh)}:${pad2(em)}:00`, tz);
  if (!start || !end || end <= start) return null;
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

export function deriveBusyFromAvailableSlotsInWorkingHours(
  slots: Array<{ startTime: string; endTime: string }>,
  dateKey: string,
  club: Club,
  workingHours = PADELOO_DEFAULT_WORKING_HOURS,
): PadelooBusyInterval[] {
  const merged = slotsToMergedRanges(slots);
  const busy: PadelooBusyInterval[] = [];
  const { openMinutes, closeMinutes } = workingHours;

  if (merged.length === 0) {
    const fullDay = minutesToBusyInterval(dateKey, openMinutes, closeMinutes, club);
    return fullDay ? [fullDay] : [];
  }

  const first = merged[0];
  if (first.start > openMinutes) {
    const interval = minutesToBusyInterval(dateKey, openMinutes, first.start, club);
    if (interval) busy.push(interval);
  }

  for (let i = 1; i < merged.length; i += 1) {
    const prev = merged[i - 1];
    const current = merged[i];
    if (current.start > prev.end) {
      const interval = minutesToBusyInterval(dateKey, prev.end, current.start, club);
      if (interval) busy.push(interval);
    }
  }

  const last = merged[merged.length - 1];
  if (last.end < closeMinutes) {
    const interval = minutesToBusyInterval(dateKey, last.end, closeMinutes, club);
    if (interval) busy.push(interval);
  }

  return busy;
}

export function availableSlotsToRangeStrings(
  slots: Array<{ startTime: string; endTime: string }>,
): string[] {
  return slotsToMergedRanges(slots).map(
    (range) => `${minutesToTimeLabel(range.start)}-${minutesToTimeLabel(range.end)}`,
  );
}

export function slotFitsAvailableSlots(
  startMinutes: number,
  endMinutes: number,
  slots: Array<{ startTime: string; endTime: string }>,
): boolean {
  return slots.some((slot) => {
    const start = parseTimeLabelToMinutes(slot.startTime);
    const end = parseTimeLabelToMinutes(slot.endTime);
    if (start == null || end == null) return false;
    return start <= startMinutes && end >= endMinutes;
  });
}

export function mapPadelooAvailableSlotsToSnapshotCourts(
  club: Club,
  rows: PadelooAvailableCourtRow[],
  dateKey: string,
): PadelooSnapshotCourtPayload[] {
  const courtsByExternal = new Map(
    (club.courts ?? [])
      .filter((c) => c.externalCourtId)
      .map((c) => [c.externalCourtId!, c]),
  );
  const grouped = new Map<string, PadelooSnapshotCourtPayload>();

  const ensure = (externalCourtId: string, integrationCourtName: string | null) => {
    const existing = grouped.get(externalCourtId);
    if (existing) return existing;
    const mapped = courtsByExternal.get(externalCourtId);
    const entry: PadelooSnapshotCourtPayload = {
      courtId: mapped?.id ?? null,
      externalCourtId,
      externalCourtName: integrationCourtName,
      busySlots: [],
    };
    grouped.set(externalCourtId, entry);
    return entry;
  };

  for (const row of rows) {
    const externalCourtId = String(row.courtId);
    const entry = ensure(externalCourtId, row.courtName ?? null);
    entry.busySlots = deriveBusyFromAvailableSlotsInWorkingHours(row.slots ?? [], dateKey, club);
  }

  for (const court of club.courts ?? []) {
    if (!court.externalCourtId) continue;
    ensure(court.externalCourtId, court.name);
  }

  return [...grouped.values()];
}

export function parseSlotMinutes(time: string): number | null {
  return parseTimeLabelToMinutes(time);
}
