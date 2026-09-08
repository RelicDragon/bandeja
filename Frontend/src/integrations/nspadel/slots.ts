import type { Club } from '@/types';
import type { BusySnapshotCourt } from '@shared/booking';
import type { NspadelAvailabilityResponse } from './client';
import { NSPADEL_BOOKING_DURATIONS } from './config';

export { NSPADEL_BOOKING_DURATIONS };
export type NspadelBookingDuration = number;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function parseTimeLabelToMinutes(time: string): number | null {
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function minutesToTimeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

export function buildNspadelEndTime(startTime: string, durationMinutes: number): string {
  const startMinutes = parseTimeLabelToMinutes(startTime);
  if (startMinutes == null) return startTime;
  return minutesToTimeLabel(startMinutes + durationMinutes);
}

/**
 * Map upstream free-slot rows to per-court busy snapshot payloads.
 * Busy intervals are the complement of the free slots inside the club's
 * working hours (08:00–23:00); courts known locally but absent upstream are
 * reported with no busy data rather than invented.
 */
export function mapNspadelAvailabilityToSnapshotCourts(
  club: Club,
  availability: NspadelAvailabilityResponse,
  durationMinutes: number,
  courtNames: Map<string, string> = new Map(),
): BusySnapshotCourt[] {
  const courtsByExternal = new Map(
    (club.courts ?? []).filter((c) => c.externalCourtId).map((c) => [c.externalCourtId!, c]),
  );
  const grouped = new Map<string, BusySnapshotCourt>();

  const ensure = (externalCourtId: string, name: string | null): BusySnapshotCourt => {
    const existing = grouped.get(externalCourtId);
    if (existing) return existing;
    const mapped = courtsByExternal.get(externalCourtId);
    const entry: BusySnapshotCourt = {
      courtId: mapped?.id ?? null,
      externalCourtId,
      externalCourtName: name,
      busySlots: [],
    };
    grouped.set(externalCourtId, entry);
    return entry;
  };

  const freeByCourt = new Map<string, Array<{ start: number; end: number }>>();
  for (const slot of availability.slots ?? []) {
    const start = parseTimeLabelToMinutes(slot.startTime);
    const end = parseTimeLabelToMinutes(slot.endTime);
    if (start == null || end == null || end <= start) continue;
    const list = freeByCourt.get(slot.courtId) ?? [];
    list.push({ start, end });
    freeByCourt.set(slot.courtId, list);
    ensure(slot.courtId, slot.courtName ?? courtNames.get(slot.courtId) ?? null);
  }

  for (const [externalCourtId, ranges] of freeByCourt) {
    const entry = ensure(externalCourtId, courtNames.get(externalCourtId) ?? null);
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    const busy: Array<{ startTime: string; endTime: string }> = [];
    let cursor = 8 * 60;
    const close = 23 * 60;
    for (const range of sorted) {
      if (range.start > cursor) {
        busy.push({ startTime: minutesToTimeLabel(cursor), endTime: minutesToTimeLabel(range.start) });
      }
      cursor = Math.max(cursor, range.end);
    }
    if (cursor < close) {
      busy.push({ startTime: minutesToTimeLabel(cursor), endTime: minutesToTimeLabel(close) });
    }
    void durationMinutes;
    entry.busySlots = busy;
  }

  for (const court of club.courts ?? []) {
    if (!court.externalCourtId) continue;
    ensure(court.externalCourtId, court.name);
  }

  return [...grouped.values()];
}
