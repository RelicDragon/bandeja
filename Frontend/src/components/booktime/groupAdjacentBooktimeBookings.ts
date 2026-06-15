import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { booktimeBookingStartMs } from '@/integrations/booktime/localTime';
import { bookingResourceExternalId } from './booktimeBookingUtils';

export type BooktimeBookingListEntry<T extends BooktimeBookingRecord = BooktimeBookingRecord> =
  | { kind: 'single'; booking: T }
  | { kind: 'group'; bookings: T[] };

function bookingInstantMs(iso: string, timeZone?: string): number {
  return booktimeBookingStartMs(iso, timeZone);
}

function sameBookingResource(a: BooktimeBookingRecord, b: BooktimeBookingRecord): boolean {
  const idA = bookingResourceExternalId(a);
  const idB = bookingResourceExternalId(b);
  if (!idA || !idB) return false;
  return idA === idB;
}

function areAdjacentBookings(
  prev: BooktimeBookingRecord,
  next: BooktimeBookingRecord,
  timeZone?: string,
): boolean {
  const prevEnd = bookingInstantMs(prev.bookingEnd, timeZone);
  const nextStart = bookingInstantMs(next.bookingStart, timeZone);
  return prevEnd > 0 && nextStart > 0 && prevEnd === nextStart;
}

function entryStartMs<T extends BooktimeBookingRecord>(
  entry: BooktimeBookingListEntry<T>,
  timeZone?: string,
): number {
  const booking = entry.kind === 'single' ? entry.booking : entry.bookings[0]!;
  return bookingInstantMs(booking.bookingStart, timeZone);
}

function groupPartition<T extends BooktimeBookingRecord>(
  bookings: T[],
  timeZone?: string,
  timeZoneOf?: (booking: T) => string | undefined,
): BooktimeBookingListEntry<T>[] {
  if (bookings.length === 0) return [];

  const partitionTimeZone = timeZone ?? timeZoneOf?.(bookings[0]!);
  const sorted = [...bookings].sort(
    (a, b) => bookingInstantMs(a.bookingStart, partitionTimeZone) - bookingInstantMs(b.bookingStart, partitionTimeZone),
  );
  const entries: BooktimeBookingListEntry<T>[] = [];
  let currentGroup: T[] = [sorted[0]!];

  const flushGroup = () => {
    if (currentGroup.length === 1) {
      entries.push({ kind: 'single', booking: currentGroup[0]! });
    } else {
      entries.push({ kind: 'group', bookings: [...currentGroup] });
    }
  };

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = currentGroup[currentGroup.length - 1]!;
    const next = sorted[i]!;
    if (sameBookingResource(prev, next) && areAdjacentBookings(prev, next, partitionTimeZone)) {
      currentGroup.push(next);
    } else {
      flushGroup();
      currentGroup = [next];
    }
  }
  flushGroup();
  return entries;
}

function partitionKey<T extends BooktimeBookingRecord>(
  booking: T,
  clubIdOf?: (booking: T) => string | undefined,
): string {
  const clubId = clubIdOf?.(booking) ?? '';
  const courtId = bookingResourceExternalId(booking) ?? '';
  return `${clubId}\0${courtId}`;
}

export function groupAdjacentBooktimeBookings<T extends BooktimeBookingRecord>(
  bookings: T[],
  options?: {
    clubIdOf?: (booking: T) => string | undefined;
    timeZone?: string;
    timeZoneOf?: (booking: T) => string | undefined;
  },
): BooktimeBookingListEntry<T>[] {
  if (bookings.length === 0) return [];

  const clubIdOf = options?.clubIdOf;
  const timeZone = options?.timeZone;
  const timeZoneOf = options?.timeZoneOf;
  const partitions = new Map<string, T[]>();

  for (const booking of bookings) {
    const key = partitionKey(booking, clubIdOf);
    const partition = partitions.get(key) ?? [];
    partition.push(booking);
    partitions.set(key, partition);
  }

  const entries = Array.from(partitions.values()).flatMap((partition) =>
    groupPartition(partition, timeZone, timeZoneOf),
  );
  entries.sort((a, b) => {
    const aTz = timeZone ?? (a.kind === 'single' ? timeZoneOf?.(a.booking) : timeZoneOf?.(a.bookings[0]!));
    const bTz = timeZone ?? (b.kind === 'single' ? timeZoneOf?.(b.booking) : timeZoneOf?.(b.bookings[0]!));
    return entryStartMs(a, aTz) - entryStartMs(b, bTz);
  });
  return entries;
}
