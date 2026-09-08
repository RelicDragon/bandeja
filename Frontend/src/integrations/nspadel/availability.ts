import type { Club, Court } from '@/types';
import type { BusySnapshotCourt } from '@shared/booking';
import { filterPastSlots, parseSlotMinutes } from '@/integrations/booktime/availability';
import { formatClubDateKey } from '@/integrations/booktime/slots';
import { clubLocalDateString } from '@/utils/clubAdmin/scheduleTime';
import {
  NSPADEL_BOOKING_DURATIONS,
  NSPADEL_DEFAULT_WORKING_HOURS,
  NSPADEL_SLOT_STEP_MINUTES,
} from './config';

export type NspadelCourtAvailabilityRow = {
  court: Court;
  externalCourtId: string;
  freeSlots: string[];
};

/** Courts mapped to the club upstream (have an external court id), sorted by name. */
export function mappedNspadelCourts(club: Club, courts?: Court[]): Court[] {
  const source = courts ?? club.courts ?? [];
  return source
    .filter((c) => typeof c.externalCourtId === 'string' && c.externalCourtId.trim())
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function parseWorkingMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
  return h * 60 + m;
}

export function nspadelWorkingMinutes(club: Club): { open: number; close: number } {
  return {
    open: parseWorkingMinutes(club.openingTime) ?? NSPADEL_DEFAULT_WORKING_HOURS.openMinutes,
    close: parseWorkingMinutes(club.closingTime) ?? NSPADEL_DEFAULT_WORKING_HOURS.closeMinutes,
  };
}

function toMinutes(label: string): number | null {
  return parseSlotMinutes(label);
}

function overlaps(start: number, end: number, busyStart: number, busyEnd: number): boolean {
  return start < busyEnd && busyStart < end;
}

/**
 * Free start-time slots for one court: 30-min grid inside working hours where
 * [start, start+duration) avoids every busy interval, with past starts of
 * today filtered out. Busy intervals come from the provider snapshot, which
 * the backend builds as the complement of the club's live free ranges.
 */
export function computeNspadelFreeSlotsForCourt(params: {
  club: Club;
  busy: Array<{ startTime?: string; endTime?: string }>;
  durationMinutes: number;
  dateKey: string;
}): string[] {
  const { club, busy, durationMinutes, dateKey } = params;
  const { open, close } = nspadelWorkingMinutes(club);
  const busyRanges = (busy ?? [])
    .map((row) => ({
      s: toMinutes(String(row.startTime ?? '')),
      e: toMinutes(String(row.endTime ?? '')),
    }))
    .filter((row): row is { s: number; e: number } => row.s != null && row.e != null && row.e > row.s);
  const starts: string[] = [];
  for (let t = open; t + durationMinutes <= close; t += NSPADEL_SLOT_STEP_MINUTES) {
    const end = t + durationMinutes;
    if (busyRanges.some((row) => overlaps(t, end, row.s, row.e))) continue;
    starts.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  }
  return filterPastSlots(starts, dateKey, club);
}

export function computeNspadelCourtAvailabilityRows(params: {
  club: Club;
  courts: Court[];
  snapshotCourts: BusySnapshotCourt[];
  durationMinutes: number;
  dateKey: string;
  courtFilter?: string | null;
}): NspadelCourtAvailabilityRow[] {
  const { club, courts, snapshotCourts, durationMinutes, dateKey, courtFilter } = params;
  const targetCourts = courtFilter ? courts.filter((court) => court.id === courtFilter) : courts;
  const busyByCourtId = new Map<string, Array<{ startTime?: string; endTime?: string }>>();
  const busyByExternalId = new Map<string, Array<{ startTime?: string; endTime?: string }>>();
  for (const row of snapshotCourts ?? []) {
    if (row.courtId) busyByCourtId.set(row.courtId, row.busySlots ?? []);
    busyByExternalId.set(row.externalCourtId, row.busySlots ?? []);
  }
  return targetCourts.map((court) => {
    const externalCourtId = court.externalCourtId!.trim();
    const busy = busyByCourtId.get(court.id) ?? busyByExternalId.get(externalCourtId) ?? [];
    return {
      court,
      externalCourtId,
      freeSlots: computeNspadelFreeSlotsForCourt({ club, busy, durationMinutes, dateKey }),
    };
  });
}

/** The club site sells a 14-day strip; mirror it for prev/next-day bounds. */
export function resolveNspadelDateBounds(club: Club, bookableDays = 14): { minDateKey: string; maxDateKey: string } {
  const todayKey = clubLocalDateString(club);
  const [y, m, d] = todayKey.split('-').map(Number);
  const max = new Date(y, (m ?? 1) - 1, (d ?? 1) + bookableDays - 1, 12, 0, 0);
  return { minDateKey: todayKey, maxDateKey: formatClubDateKey(max, club) };
}

export const NSPADEL_DURATIONS_FALLBACK = [...NSPADEL_BOOKING_DURATIONS];
