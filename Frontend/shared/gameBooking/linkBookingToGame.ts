import {
  BOOKTIME_DEFAULT_TIMEZONE,
  booktimeWireFormatToStoredUtcIso,
  storedUtcIsoToInstant,
} from '../booktime/localTime';
import { buildBookingSnapshots } from './buildBookingSnapshots';
import { deriveGameTimeFromBookings } from './deriveGameTimeFromBookings';
import type { BookingSnapshotInput, LinkBookingToGameBody } from './contracts';

export type LinkBookingGameRef = {
  id?: string;
  timeIsSet?: boolean | null;
  startTime?: string;
  endTime?: string;
  clubId?: string | null;
  courtId?: string | null;
  city?: { timezone?: string | null } | null;
  entityType?: string;
  status?: string;
  name?: string | null;
  participants?: Array<{ userId: string; role: string }>;
};

export type LinkedGameTimeRef = {
  startTime: string;
  endTime?: string | null;
  timeIsSet?: boolean | null;
  linkBookingStart?: string | null;
  linkBookingEnd?: string | null;
};

export type LinkBookingCourtRef = {
  id: string;
  externalCourtId?: string | null;
};

export type LinkBookingClubRef = {
  clubId: string;
  courts: LinkBookingCourtRef[];
};

export type LinkBookingRecord = {
  uuid: string;
  bookingStart: string;
  bookingEnd: string;
  bookingResource?: { id?: string; bookingResourceId?: string; uuid?: string };
  bookingResourceId?: string;
};

export type BuildLinkBookingRequestOptions = {
  courtId?: string;
  timeZone?: string | null;
  skipGameDatetimePatch?: boolean;
};

export type LinkBookingApi = {
  linkBooking: (gameId: string, body: LinkBookingToGameBody) => Promise<unknown>;
};

function bookingInstantMs(bookingStart: string, bookingEnd: string): {
  startMs: number;
  endMs: number;
} | null {
  const start = storedUtcIsoToInstant(bookingStart);
  const end = storedUtcIsoToInstant(bookingEnd);
  if (!start || !end) return null;
  return { startMs: start.getTime(), endMs: end.getTime() };
}

function instantMsFromBookingTime(iso: string, timeZone?: string | null): number | null {
  const tz = timeZone ?? BOOKTIME_DEFAULT_TIMEZONE;
  const normalized = booktimeWireFormatToStoredUtcIso(iso.trim(), tz) ?? iso.trim();
  const instant = storedUtcIsoToInstant(normalized);
  return instant?.getTime() ?? null;
}

function instantMsFromGameTime(iso: string): number | null {
  const instant = storedUtcIsoToInstant(iso.trim());
  return instant?.getTime() ?? null;
}

function bookingSlotInstantMs(
  bookingStart: string,
  bookingEnd: string,
  timeZone?: string | null,
): { startMs: number; endMs: number } | null {
  const startMs = instantMsFromBookingTime(bookingStart, timeZone);
  const endMs = instantMsFromBookingTime(bookingEnd, timeZone);
  if (startMs == null || endMs == null) return null;
  return { startMs, endMs };
}

function gameInstantMs(
  startTime: string,
  endTime: string,
  booking: LinkBookingRecord,
  timeZone?: string | null,
): { startMs: number; endMs: number } | null {
  const tz = timeZone ?? BOOKTIME_DEFAULT_TIMEZONE;
  const candidates = [
    {
      startMs: instantMsFromBookingTime(startTime, tz),
      endMs: instantMsFromBookingTime(endTime, tz),
    },
    {
      startMs: instantMsFromGameTime(startTime),
      endMs: instantMsFromGameTime(endTime),
    },
    {
      startMs:
        startTime === booking.bookingStart
          ? instantMsFromBookingTime(startTime, tz)
          : instantMsFromGameTime(startTime),
      endMs:
        endTime === booking.bookingEnd
          ? instantMsFromBookingTime(endTime, tz)
          : instantMsFromGameTime(endTime),
    },
  ];

  for (const candidate of candidates) {
    if (candidate.startMs == null || candidate.endMs == null) continue;
    if (candidate.endMs > candidate.startMs) {
      return { startMs: candidate.startMs, endMs: candidate.endMs };
    }
  }
  return null;
}

function linkSnapshotInstantMs(
  linkBookingStart: string,
  linkBookingEnd: string,
): { startMs: number; endMs: number } | null {
  const startMs = instantMsFromGameTime(linkBookingStart);
  const endMs = instantMsFromGameTime(linkBookingEnd);
  if (startMs == null || endMs == null || endMs <= startMs) return null;
  return { startMs, endMs };
}

function clipIntervalToBooking(
  interval: { startMs: number; endMs: number },
  bookingMs: { startMs: number; endMs: number },
): { start: number; end: number } | null {
  const clippedStart = Math.max(interval.startMs, bookingMs.startMs);
  const clippedEnd = Math.min(interval.endMs, bookingMs.endMs);
  if (clippedEnd <= clippedStart) return null;
  return { start: clippedStart, end: clippedEnd };
}

export function resolveBooktimeClubTimezone(options?: {
  club?: LinkBookingClubRef | { integrationType?: string | null } | null;
  game?: LinkBookingGameRef | null;
  explicit?: string | null;
}): string {
  if (options?.explicit) return options.explicit;
  if (options?.club) {
    if ('clubId' in options.club && !('integrationType' in options.club)) {
      return BOOKTIME_DEFAULT_TIMEZONE;
    }
    if ('integrationType' in options.club && options.club.integrationType === 'BOOKTIME') {
      return BOOKTIME_DEFAULT_TIMEZONE;
    }
  }
  return options?.game?.city?.timezone ?? BOOKTIME_DEFAULT_TIMEZONE;
}

export function bookingMatchesGameSlot(
  booking: LinkBookingRecord,
  game: LinkBookingGameRef,
  timeZone?: string | null,
): boolean {
  if (game.timeIsSet !== true) return false;
  const tz = timeZone ?? resolveBooktimeClubTimezone({ game });
  if (!tz) {
    return (
      new Date(game.startTime!).getTime() === new Date(booking.bookingStart).getTime() &&
      new Date(game.endTime!).getTime() === new Date(booking.bookingEnd).getTime()
    );
  }
  const bookingMs = bookingInstantMs(booking.bookingStart, booking.bookingEnd);
  if (!bookingMs) return false;
  return (
    new Date(game.startTime!).getTime() === bookingMs.startMs &&
    new Date(game.endTime!).getTime() === bookingMs.endMs
  );
}

function mergeTimeIntervals(intervals: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [{ ...sorted[0]! }];
  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i]!;
    const last = merged[merged.length - 1]!;
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

const BOOKING_SLOT_SEGMENT_MS = 30 * 60 * 1000;

export type BookingSlotSegmentState = 'empty' | 'partial' | 'full' | 'overlap';

function collectBookingSlotGameIntervals(
  bookingMs: { startMs: number; endMs: number },
  booking: LinkBookingRecord,
  linkedGames: LinkedGameTimeRef[],
  timeZone?: string | null,
): Array<{ start: number; end: number }> {
  const intervals: Array<{ start: number; end: number }> = [];
  for (const game of linkedGames) {
    if (game.linkBookingStart && game.linkBookingEnd) {
      const linkMs = linkSnapshotInstantMs(game.linkBookingStart, game.linkBookingEnd);
      const clipped = linkMs ? clipIntervalToBooking(linkMs, bookingMs) : null;
      if (clipped) intervals.push(clipped);
      continue;
    }
    if (!game.startTime || !game.endTime) continue;
    const gameMs = gameInstantMs(game.startTime, game.endTime, booking, timeZone);
    const clipped = gameMs ? clipIntervalToBooking(gameMs, bookingMs) : null;
    if (clipped) intervals.push(clipped);
  }
  return intervals;
}

function collectBookingSlotOccupiedIntervals(
  bookingMs: { startMs: number; endMs: number },
  booking: LinkBookingRecord,
  linkedGames: LinkedGameTimeRef[],
  timeZone?: string | null,
): Array<{ start: number; end: number }> {
  return mergeTimeIntervals(
    collectBookingSlotGameIntervals(bookingMs, booking, linkedGames, timeZone),
  );
}

function clipIntervalToSegment(
  interval: { start: number; end: number },
  segStart: number,
  segEnd: number,
): { start: number; end: number } | null {
  const clippedStart = Math.max(interval.start, segStart);
  const clippedEnd = Math.min(interval.end, segEnd);
  if (clippedEnd <= clippedStart) return null;
  return { start: clippedStart, end: clippedEnd };
}

function intervalsOverlapInRange(
  intervals: Array<{ start: number; end: number }>,
): boolean {
  for (let i = 0; i < intervals.length; i += 1) {
    for (let j = i + 1; j < intervals.length; j += 1) {
      const a = intervals[i]!;
      const b = intervals[j]!;
      if (a.start < b.end && b.start < a.end) return true;
    }
  }
  return false;
}

function resolveSegmentState(
  segStart: number,
  segEnd: number,
  intervals: Array<{ start: number; end: number }>,
  linkedFallbackFull: boolean,
): BookingSlotSegmentState {
  if (linkedFallbackFull) return 'full';

  const clipped = intervals
    .map((interval) => clipIntervalToSegment(interval, segStart, segEnd))
    .filter((interval): interval is { start: number; end: number } => interval != null);
  if (clipped.length === 0) return 'empty';
  if (intervalsOverlapInRange(clipped)) return 'overlap';

  const segDuration = segEnd - segStart;
  const coveredMs = mergeTimeIntervals(clipped).reduce(
    (sum, interval) => sum + (interval.end - interval.start),
    0,
  );
  if (coveredMs >= segDuration) return 'full';
  return 'partial';
}

function bookingSlotSegmentsForRange(
  rangeStartMs: number,
  rangeEndMs: number,
  intervals: Array<{ start: number; end: number }>,
  linkedFallbackFull: boolean,
): BookingSlotSegmentState[] {
  const duration = rangeEndMs - rangeStartMs;
  if (duration <= 0) return [];

  const segmentCount = Math.ceil(duration / BOOKING_SLOT_SEGMENT_MS);
  const segments: BookingSlotSegmentState[] = [];
  for (let i = 0; i < segmentCount; i += 1) {
    const segStart = rangeStartMs + i * BOOKING_SLOT_SEGMENT_MS;
    const segEnd = Math.min(segStart + BOOKING_SLOT_SEGMENT_MS, rangeEndMs);
    segments.push(resolveSegmentState(segStart, segEnd, intervals, linkedFallbackFull));
  }
  return segments;
}

function applySlotFullyLinkedTone(
  segments: BookingSlotSegmentState[],
  slotFullyLinked: boolean,
): BookingSlotSegmentState[] {
  if (slotFullyLinked) return segments;
  return segments.map((segment) => (segment === 'full' ? 'partial' : segment));
}

export function linkedGamesBookingSlotSegments(
  booking: LinkBookingRecord,
  linkedGames: LinkedGameTimeRef[],
  timeZone?: string | null,
): BookingSlotSegmentState[] {
  const bookingMs = bookingSlotInstantMs(booking.bookingStart, booking.bookingEnd, timeZone);
  if (!bookingMs) return [];

  const intervals = collectBookingSlotGameIntervals(bookingMs, booking, linkedGames, timeZone);
  const linkedFallbackFull = intervals.length === 0 && linkedGames.length > 0;
  const segments = bookingSlotSegmentsForRange(
    bookingMs.startMs,
    bookingMs.endMs,
    intervals,
    linkedFallbackFull,
  );
  const slotFullyLinked = linkedGamesFullyCoverBookingSlot(booking, linkedGames, timeZone);
  return applySlotFullyLinkedTone(segments, slotFullyLinked);
}

export function linkedGamesBookingGroupSlotSegments(
  bookings: LinkBookingRecord[],
  linkedGamesByBookingId: ReadonlyMap<string, LinkedGameTimeRef[]>,
  timeZone?: string | null,
): BookingSlotSegmentState[] {
  if (bookings.length === 0) return [];

  const firstMs = bookingSlotInstantMs(bookings[0]!.bookingStart, bookings[0]!.bookingEnd, timeZone);
  const lastMs = bookingSlotInstantMs(
    bookings[bookings.length - 1]!.bookingStart,
    bookings[bookings.length - 1]!.bookingEnd,
    timeZone,
  );
  if (!firstMs || !lastMs) return [];

  const rangeStartMs = firstMs.startMs;
  const rangeEndMs = lastMs.endMs;
  const duration = rangeEndMs - rangeStartMs;
  if (duration <= 0) return [];

  const segmentCount = Math.ceil(duration / BOOKING_SLOT_SEGMENT_MS);
  const segments: BookingSlotSegmentState[] = [];

  for (let i = 0; i < segmentCount; i += 1) {
    const segStart = rangeStartMs + i * BOOKING_SLOT_SEGMENT_MS;
    const segEnd = Math.min(segStart + BOOKING_SLOT_SEGMENT_MS, rangeEndMs);

    const intervals: Array<{ start: number; end: number }> = [];
    let linkedCount = 0;
    for (const booking of bookings) {
      const bookingMs = bookingSlotInstantMs(booking.bookingStart, booking.bookingEnd, timeZone);
      if (!bookingMs) continue;
      if (bookingMs.endMs <= segStart || bookingMs.startMs >= segEnd) continue;

      const linkedGames = linkedGamesByBookingId.get(booking.uuid) ?? [];
      linkedCount += linkedGames.length;
      intervals.push(
        ...collectBookingSlotGameIntervals(bookingMs, booking, linkedGames, timeZone),
      );
    }

    segments.push(
      resolveSegmentState(segStart, segEnd, intervals, linkedCount > 0 && intervals.length === 0),
    );
  }

  const slotFullyLinked =
    linkedGamesBookingGroupOccupancyPercent(bookings, linkedGamesByBookingId, timeZone) >= 100;
  return applySlotFullyLinkedTone(segments, slotFullyLinked);
}

export function bookingSlotSegmentsOccupancyPercent(segments: BookingSlotSegmentState[]): number {
  if (segments.length === 0) return 0;
  let sum = 0;
  for (const segment of segments) {
    if (segment === 'full' || segment === 'overlap') sum += 100;
    else if (segment === 'partial') sum += 50;
  }
  return Math.min(100, Math.round(sum / segments.length));
}

export function linkedGamesBookingSlotOccupancyPercent(
  booking: LinkBookingRecord,
  linkedGames: LinkedGameTimeRef[],
  timeZone?: string | null,
): number {
  const bookingMs = bookingSlotInstantMs(booking.bookingStart, booking.bookingEnd, timeZone);
  if (!bookingMs) return 0;
  const duration = bookingMs.endMs - bookingMs.startMs;
  if (duration <= 0) return 0;

  const occupiedIntervals = collectBookingSlotOccupiedIntervals(bookingMs, booking, linkedGames, timeZone);
  if (occupiedIntervals.length === 0 && linkedGames.length > 0) {
    return 100;
  }
  if (occupiedIntervals.length === 0) return 0;

  const occupiedMs = occupiedIntervals.reduce((sum, interval) => sum + (interval.end - interval.start), 0);
  return Math.min(100, Math.round((occupiedMs / duration) * 100));
}

export function linkedGamesBookingGroupOccupancyPercent(
  bookings: LinkBookingRecord[],
  linkedGamesByBookingId: ReadonlyMap<string, LinkedGameTimeRef[]>,
  timeZone?: string | null,
): number {
  let totalDuration = 0;
  let totalOccupied = 0;

  for (const booking of bookings) {
    const bookingMs = bookingSlotInstantMs(booking.bookingStart, booking.bookingEnd, timeZone);
    if (!bookingMs) continue;
    const duration = bookingMs.endMs - bookingMs.startMs;
    if (duration <= 0) continue;

    const linkedGames = linkedGamesByBookingId.get(booking.uuid) ?? [];
    const slotPercent = linkedGamesBookingSlotOccupancyPercent(booking, linkedGames, timeZone);

    totalDuration += duration;
    totalOccupied += (slotPercent / 100) * duration;
  }

  if (totalDuration <= 0) return 0;
  return Math.min(100, Math.round((totalOccupied / totalDuration) * 100));
}

export function linkedGamesFullyCoverBookingSlot(
  booking: LinkBookingRecord,
  linkedGames: LinkedGameTimeRef[],
  timeZone?: string | null,
): boolean {
  return linkedGamesBookingSlotOccupancyPercent(booking, linkedGames, timeZone) >= 100;
}

export function isRecommendedLinkTarget(
  game: LinkBookingGameRef,
  booking: LinkBookingRecord,
  timeZone?: string | null,
): boolean {
  return bookingMatchesGameSlot(booking, game, timeZone);
}

export function filterLinkableGames<T extends LinkBookingGameRef>(
  games: T[],
  userId: string,
  now = new Date(),
): T[] {
  const nowMs = now.getTime();
  return games.filter((game) => {
    if (game.entityType !== 'GAME') return false;
    if (game.status !== 'ANNOUNCED') return false;
    const isOwner = game.participants?.some((p) => p.userId === userId && p.role === 'OWNER');
    if (!isOwner) return false;
    if (game.timeIsSet === false) return true;
    if (game.timeIsSet === true) {
      return new Date(game.startTime!).getTime() >= nowMs;
    }
    return false;
  });
}

export function sortLinkableGames<T extends LinkBookingGameRef>(
  games: T[],
  booking: LinkBookingRecord,
  timeZone?: string | null,
): T[] {
  const recommended: T[] = [];
  const rest: T[] = [];
  for (const game of games) {
    if (isRecommendedLinkTarget(game, booking, timeZone)) recommended.push(game);
    else rest.push(game);
  }
  const byStart = (a: T, b: T) =>
    new Date(a.startTime!).getTime() - new Date(b.startTime!).getTime();
  recommended.sort(byStart);
  rest.sort(byStart);
  return [...recommended, ...rest];
}

export function gameNeedsDatetimeUpdateForLink(
  game: LinkBookingGameRef,
  booking: LinkBookingRecord,
  timeZone?: string | null,
): boolean {
  return game.timeIsSet !== true || !bookingMatchesGameSlot(booking, game, timeZone);
}

export function buildLinkBookingSnapshot(
  booking: LinkBookingRecord,
  club: LinkBookingClubRef,
  courtId?: string,
  timeZone?: string | null,
): BookingSnapshotInput | undefined {
  const tz = resolveBooktimeClubTimezone({ club, explicit: timeZone });
  const snapshots = buildBookingSnapshots([booking], club.courts, { timeZone: tz });
  if (courtId && snapshots[0]) snapshots[0].courtId = courtId;
  return snapshots[0];
}

export function buildLinkBookingToGameUpdate(
  game: LinkBookingGameRef,
  booking: LinkBookingRecord,
  club: LinkBookingClubRef,
  courtId?: string,
  timeZone?: string | null,
  skipGameDatetimePatch = false,
): Partial<LinkBookingGameRef & { hasBookedCourt?: boolean }> {
  const tz = resolveBooktimeClubTimezone({ club, game, explicit: timeZone });
  const snapshot = buildLinkBookingSnapshot(booking, club, courtId, tz);
  const resolvedCourtId = courtId ?? snapshot?.courtId;
  const update: Partial<LinkBookingGameRef & { hasBookedCourt?: boolean }> = {
    hasBookedCourt: true,
  };
  if (!skipGameDatetimePatch && gameNeedsDatetimeUpdateForLink(game, booking, tz)) {
    update.startTime = snapshot?.bookingStart ?? booking.bookingStart;
    update.endTime = snapshot?.bookingEnd ?? booking.bookingEnd;
    update.timeIsSet = true;
  }
  if (club.clubId && game.clubId !== club.clubId) {
    update.clubId = club.clubId;
  }
  if (resolvedCourtId && game.courtId !== resolvedCourtId) {
    update.courtId = resolvedCourtId;
  }
  return update;
}

export function buildLinkBookingRequest(
  game: LinkBookingGameRef,
  booking: LinkBookingRecord,
  club: LinkBookingClubRef,
  options?: BuildLinkBookingRequestOptions,
): LinkBookingToGameBody {
  const tz = resolveBooktimeClubTimezone({ club, game, explicit: options?.timeZone });
  const snapshot = buildLinkBookingSnapshot(booking, club, options?.courtId, tz);
  if (!snapshot) {
    throw new Error('Booking snapshot required to link');
  }
  const gameUpdate = buildLinkBookingToGameUpdate(
    game,
    booking,
    club,
    options?.courtId,
    tz,
    options?.skipGameDatetimePatch,
  );
  const gamePatch: LinkBookingToGameBody['gamePatch'] = {};
  if (gameUpdate.hasBookedCourt !== undefined) gamePatch.hasBookedCourt = gameUpdate.hasBookedCourt;
  if (typeof gameUpdate.clubId === 'string') gamePatch.clubId = gameUpdate.clubId;
  if (typeof gameUpdate.courtId === 'string') gamePatch.courtId = gameUpdate.courtId;
  if (typeof gameUpdate.startTime === 'string') gamePatch.startTime = gameUpdate.startTime;
  if (typeof gameUpdate.endTime === 'string') gamePatch.endTime = gameUpdate.endTime;
  if (gameUpdate.timeIsSet === true) gamePatch.timeIsSet = true;
  return {
    externalBookingId: booking.uuid,
    snapshot,
    ...(Object.keys(gamePatch).length > 0 ? { gamePatch } : {}),
  };
}

export function buildCreateGameDeepLinkParams(
  clubId: string,
  booking: LinkBookingRecord | readonly LinkBookingRecord[],
  courtId?: string,
  timeZone?: string | null,
): Record<string, string> {
  const bookings = Array.isArray(booking) ? [...booking] : [booking];
  const primary = bookings[0];
  if (!primary) {
    return { clubId, hasBookedCourt: '1' };
  }

  const tz = resolveBooktimeClubTimezone({ explicit: timeZone });
  const snapshots = buildBookingSnapshots(bookings, [], { timeZone: tz });
  const derived = deriveGameTimeFromBookings(snapshots, { timeZone: tz });
  const primarySnapshot = buildLinkBookingSnapshot(primary, { clubId, courts: [] }, courtId, tz);
  const startTime =
    derived.startTime ?? primarySnapshot?.bookingStart ?? primary.bookingStart;
  const endTime = derived.endTime ?? primarySnapshot?.bookingEnd ?? primary.bookingEnd;

  const params: Record<string, string> = {
    clubId,
    locationTimeMode: 'bookings',
    bookingIds: bookings.map((entry) => entry.uuid).join(','),
    hasBookedCourt: '1',
    startTime,
    endTime,
  };
  if (courtId) params.courtId = courtId;
  return params;
}

export async function linkBookingToGame(
  api: LinkBookingApi,
  gameId: string,
  game: LinkBookingGameRef,
  booking: LinkBookingRecord,
  club: LinkBookingClubRef,
  options?: BuildLinkBookingRequestOptions,
): Promise<unknown> {
  const body = buildLinkBookingRequest(game, booking, club, options);
  return api.linkBooking(gameId, body);
}
