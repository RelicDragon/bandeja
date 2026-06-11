import type { Club } from '@/types';
import { getClubTimezone } from '@/hooks/useGameTimeDuration';

import { BOOKTIME_FALLBACK_DURATIONS_MINUTES } from './durations';

export const BOOKTIME_SNAPSHOT_FRESH_MS = 5 * 60 * 1000;
export const BOOKTIME_CONFIRM_RECHECK_MS = 60 * 1000;
export const BOOKTIME_SLOT_STEP_MINUTES = 60;
export const BOOKTIME_BOOKING_DURATIONS = BOOKTIME_FALLBACK_DURATIONS_MINUTES;
export type BooktimeBookingDuration = number;

export type BooktimeBusyInterval = {
  startTime: string;
  endTime: string;
};

export type BooktimeSnapshotCourtPayload = {
  courtId: string | null;
  externalCourtId: string;
  externalCourtName?: string | null;
  busySlots: BooktimeBusyInterval[];
};

export type BooktimeForDayResource = {
  uuid?: string;
  bookingResourceId?: string;
  name?: string;
  bookings?: Array<{ bookingStart?: string; bookingEnd?: string; startTime?: string; endTime?: string }>;
  busySlots?: Array<{ startTime?: string; endTime?: string; bookingStart?: string; bookingEnd?: string }>;
};

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
  nowMs = Date.now()
): boolean {
  if (!fetchedAt) return true;
  const ts = new Date(fetchedAt).getTime();
  if (Number.isNaN(ts)) return true;
  return nowMs - ts >= maxAgeMs;
}

function parseTimeLabelToMinutes(time: string): number | null {
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function parseSlots(availableSlots: string[], durationMinutes: number): string[] {
  return availableSlots.filter((range) => {
    const [rangeStart, rangeEnd] = range.split('-');
    if (!rangeStart || !rangeEnd) return false;
    const startMinutes = parseTimeLabelToMinutes(rangeStart.trim());
    const endMinutes = parseTimeLabelToMinutes(rangeEnd.trim());
    if (startMinutes == null || endMinutes == null) return false;
    return endMinutes - startMinutes >= durationMinutes;
  });
}

export function computeFreeSlotsForCourt(
  availableRanges: string[],
  busy: BooktimeBusyInterval[],
  durationMinutes: number,
  club?: Club,
  dateKey?: string
): string[] {
  const parsed = parseSlots(availableRanges, durationMinutes);
  return subtractBusyFromRanges(
    parsed,
    busy,
    durationMinutes,
    BOOKTIME_SLOT_STEP_MINUTES,
    club,
    dateKey
  );
}

export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function slotOverlapsInterval(
  slotStartMinutes: number,
  slotEndMinutes: number,
  intervalStart: Date,
  intervalEnd: Date,
  club?: Club,
  dateKey?: string
): boolean {
  const startHour = Math.floor(slotStartMinutes / 60);
  const startMinute = slotStartMinutes % 60;
  const endHour = Math.floor(slotEndMinutes / 60);
  const endMinute = slotEndMinutes % 60;
  const tz = getClubTimezone(club);
  const base = dateKey ?? formatClubDateKey(new Date(), club);
  const slotStart = parseClubLocalIso(`${base}T${pad2(startHour)}:${pad2(startMinute)}:00`, tz);
  const slotEnd = parseClubLocalIso(`${base}T${pad2(endHour)}:${pad2(endMinute)}:00`, tz);
  if (!slotStart || !slotEnd) return false;
  return intervalsOverlap(slotStart, slotEnd, intervalStart, intervalEnd);
}

export function expandBusyToGridCells(
  busy: BooktimeBusyInterval[],
  stepMinutes = 30,
  club?: Club
): Set<string> {
  const cells = new Set<string>();
  for (const interval of busy) {
    const start = new Date(interval.startTime);
    const end = new Date(interval.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) continue;

    const startLabel = formatTimeInClubTz(start, club);
    const endLabel = formatTimeInClubTz(end, club);
    const [sh, sm] = startLabel.split(':').map(Number);
    const [eh, em] = endLabel.split(':').map(Number);
    let cursor = sh * 60 + sm;
    const endMinutes = eh * 60 + em;
    while (cursor < endMinutes) {
      const h = Math.floor(cursor / 60);
      const m = cursor % 60;
      cells.add(`${pad2(h)}:${pad2(m)}`);
      cursor += stepMinutes;
    }
  }
  return cells;
}

export function subtractBusyFromRanges(
  availableRanges: string[],
  busy: BooktimeBusyInterval[],
  durationMinutes: number,
  stepMinutes: number,
  club?: Club,
  dateKey?: string
): string[] {
  const freeStarts: string[] = [];
  for (const range of availableRanges) {
    const [rangeStart, rangeEnd] = range.split('-');
    if (!rangeStart || !rangeEnd) continue;
    const [rsH, rsM] = rangeStart.split(':').map(Number);
    const [reH, reM] = rangeEnd.split(':').map(Number);
    let cursor = rsH * 60 + rsM;
    const rangeEndMinutes = reH * 60 + reM;
    while (cursor + durationMinutes <= rangeEndMinutes) {
      const h = Math.floor(cursor / 60);
      const m = cursor % 60;
      const label = `${pad2(h)}:${pad2(m)}`;
      const slotEnd = cursor + durationMinutes;
      const blocked = busy.some((interval) => {
        const start = new Date(interval.startTime);
        const end = new Date(interval.endTime);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
        return slotOverlapsInterval(cursor, slotEnd, start, end, club, dateKey);
      });
      if (!blocked) freeStarts.push(label);
      cursor += stepMinutes;
    }
  }
  return freeStarts;
}

function resourceExternalId(resource: BooktimeForDayResource): string | null {
  const id = resource.bookingResourceId ?? resource.uuid;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

function normalizeInterval(raw: Record<string, unknown>): BooktimeBusyInterval | null {
  const startRaw = raw.bookingStart ?? raw.startTime;
  const endRaw = raw.bookingEnd ?? raw.endTime;
  if (typeof startRaw !== 'string' || typeof endRaw !== 'string') return null;
  const start = new Date(startRaw);
  const end = new Date(endRaw);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

export function parseGetForDayResponse(raw: unknown): BooktimeForDayResource[] {
  if (Array.isArray(raw)) {
    if (raw.length > 0 && raw[0] && typeof raw[0] === 'object') {
      const first = raw[0] as Record<string, unknown>;
      const isFlatBooking =
        typeof first.bookingResourceId === 'string' ||
        (typeof first.bookingStart === 'string' && !('bookings' in first));
      if (isFlatBooking) {
        const grouped = new Map<string, BooktimeForDayResource>();
        for (const item of raw) {
          if (!item || typeof item !== 'object') continue;
          const record = item as Record<string, unknown>;
          const externalCourtId =
            typeof record.bookingResourceId === 'string'
              ? record.bookingResourceId
              : typeof record.uuid === 'string'
                ? record.uuid
                : null;
          if (!externalCourtId) continue;
          const entry = grouped.get(externalCourtId) ?? {
            bookingResourceId: externalCourtId,
            name: typeof record.bookingResourceName === 'string' ? record.bookingResourceName : undefined,
            bookings: [],
          };
          entry.bookings!.push({
            bookingStart: typeof record.bookingStart === 'string' ? record.bookingStart : undefined,
            bookingEnd: typeof record.bookingEnd === 'string' ? record.bookingEnd : undefined,
            startTime: typeof record.startTime === 'string' ? record.startTime : undefined,
            endTime: typeof record.endTime === 'string' ? record.endTime : undefined,
          });
          grouped.set(externalCourtId, entry);
        }
        return [...grouped.values()];
      }
    }
    return raw.filter((item): item is BooktimeForDayResource => !!item && typeof item === 'object');
  }
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    if (Array.isArray(record.bookings)) return parseGetForDayResponse(record.bookings);
    if (Array.isArray(record.bookingResources)) return parseGetForDayResponse(record.bookingResources);
  }
  return [];
}

export function mapGetForDayToSnapshotCourts(
  club: Club,
  resources: BooktimeForDayResource[]
): BooktimeSnapshotCourtPayload[] {
  const courtsByExternal = new Map(
    (club.courts ?? [])
      .filter((c) => c.externalCourtId)
      .map((c) => [c.externalCourtId!, c])
  );
  const grouped = new Map<string, BooktimeSnapshotCourtPayload>();

  const ensure = (externalCourtId: string, integrationCourtName: string | null) => {
    const existing = grouped.get(externalCourtId);
    if (existing) return existing;
    const mapped = courtsByExternal.get(externalCourtId);
    const entry: BooktimeSnapshotCourtPayload = {
      courtId: mapped?.id ?? null,
      externalCourtId,
      externalCourtName: integrationCourtName,
      busySlots: [],
    };
    grouped.set(externalCourtId, entry);
    return entry;
  };

  for (const resource of resources) {
    const externalCourtId = resourceExternalId(resource);
    if (!externalCourtId) continue;
    const entry = ensure(externalCourtId, typeof resource.name === 'string' ? resource.name : null);
    const rawIntervals = [...(resource.bookings ?? []), ...(resource.busySlots ?? [])];
    for (const raw of rawIntervals) {
      if (!raw || typeof raw !== 'object') continue;
      const interval = normalizeInterval(raw as Record<string, unknown>);
      if (interval) entry.busySlots.push(interval);
    }
  }

  for (const court of club.courts ?? []) {
    if (!court.externalCourtId) continue;
    ensure(court.externalCourtId, court.name);
  }

  return [...grouped.values()];
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatTimeInClubTz(date: Date, club?: Club): string {
  const tz = getClubTimezone(club);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function parseClubLocalIso(localIso: string, timeZone: string): Date | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(localIso);
  if (!match) return null;
  const [, ymd, hh, mm] = match;
  const probe = new Date(`${ymd}T${hh}:${mm}:00`);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(probe);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  const displayedMinutes =
    Number(get('hour')) * 60 + Number(get('minute'));
  const targetMinutes = Number(hh) * 60 + Number(mm);
  return new Date(probe.getTime() + (targetMinutes - displayedMinutes) * 60_000);
}
