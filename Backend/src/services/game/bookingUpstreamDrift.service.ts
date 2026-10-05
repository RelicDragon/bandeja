/**
 * Club-side drift of linked bookings (docs/domains/booking.md "Club-side drift").
 *
 * The backend never calls the providers. What the club says comes from the app:
 *  - the app-fed booking-list mirror sync (`PUT /booking-mirror/...`, the user's own bookings),
 *  - a client verify (`POST /games/:id/bookings/:linkId/upstream-check`).
 * Each observation sets `GameExternalBooking.upstreamState` (OK / MOVED / MISSING) and, for
 * MOVED, the provider's times. Neither the game nor the link times change on their own; the
 * organizer accepts a MOVED booking with `accept-upstream` (move the game / keep the game).
 */
import { ClubIntegrationType, GameExternalBookingUpstreamState, GameStatus, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { BOOKING_ERROR_KEYS } from '@bandeja/shared/booking/errorKeys';
import { canMutateGameBookings } from '../../shared/gameBooking/bookingLinkAuthorization';
import { emitGameUpdate } from '../socketEmitFacade';
import {
  gameExternalBookingSelect,
  runBookingLinkTransaction,
  serializeLinkedBooking,
  syncGameBookingState,
  UPSTREAM_IN_SYNC,
} from './gameExternalBooking.service';
import { notifyGameBookingStatusChangeIfNeeded } from './notifyGameBookingStatusChange';
import { GameUpdateService } from './update.service';

export const UPSTREAM_NOT_MOVED_CODE = 'booking.upstream.notMoved';

export type UpstreamObservation =
  | { present: false }
  | { present: true; start?: Date | null; end?: Date | null };

export type UpstreamVerdict = {
  upstreamState: GameExternalBookingUpstreamState;
  upstreamStart: Date | null;
  upstreamEnd: Date | null;
};

const sameInstant = (a: Date | null | undefined, b: Date | null | undefined) =>
  a != null && b != null && a.getTime() === b.getTime();

/** Pure: what one observation says about one link. */
export function classifyUpstream(
  link: { bookingStart: Date | null; bookingEnd: Date | null },
  observation: UpstreamObservation,
): UpstreamVerdict {
  if (!observation.present) {
    return { upstreamState: GameExternalBookingUpstreamState.MISSING, upstreamStart: null, upstreamEnd: null };
  }
  const { start, end } = observation;
  const comparable = start != null && end != null && link.bookingStart != null && link.bookingEnd != null;
  if (!comparable || (sameInstant(start, link.bookingStart) && sameInstant(end, link.bookingEnd))) {
    return { upstreamState: GameExternalBookingUpstreamState.OK, upstreamStart: null, upstreamEnd: null };
  }
  return { upstreamState: GameExternalBookingUpstreamState.MOVED, upstreamStart: start!, upstreamEnd: end! };
}

type DriftLinkRow = {
  id: string;
  gameId: string;
  bookingStart: Date | null;
  bookingEnd: Date | null;
  upstreamState: GameExternalBookingUpstreamState;
  upstreamStart: Date | null;
  upstreamEnd: Date | null;
};

function verdictChanged(row: DriftLinkRow, verdict: UpstreamVerdict): boolean {
  return (
    row.upstreamState !== verdict.upstreamState ||
    (row.upstreamStart?.getTime() ?? null) !== (verdict.upstreamStart?.getTime() ?? null) ||
    (row.upstreamEnd?.getTime() ?? null) !== (verdict.upstreamEnd?.getTime() ?? null)
  );
}

/** Writes the verdict (always stamping `upstreamCheckedAt`); true when the state changed. */
async function applyVerdict(row: DriftLinkRow, verdict: UpstreamVerdict, now: Date): Promise<boolean> {
  const changed = verdictChanged(row, verdict);
  await prisma.gameExternalBooking.update({
    where: { id: row.id },
    data: { ...verdict, upstreamCheckedAt: now },
  });
  return changed;
}

const DRIFT_LINK_SELECT = {
  id: true,
  gameId: true,
  externalBookingId: true,
  bookingStart: true,
  bookingEnd: true,
  upstreamState: true,
  upstreamStart: true,
  upstreamEnd: true,
} as const;

export type MirrorDriftInput = {
  provider: ClubIntegrationType;
  clubId: string;
  rangeFrom: Date;
  rangeTo: Date;
  complete: boolean;
  bookings: Array<{ externalBookingId: string; start: Date; end: Date; state: 'CONFIRMED' | 'CANCELLED' }>;
};

/**
 * After a mirror sync of `userId`'s bookings at (provider, club): compare every link of an
 * upcoming game of that club that this user booked with the same provider booking id.
 * Times differ → MOVED; listed as cancelled, or absent from a complete list whose range
 * holds the link's start → MISSING; matching → OK. Links outside the synced range are left
 * alone. Emits `game-updated` for games whose drift changed. Never moves a game or a link.
 */
export async function detectUpstreamDriftFromMirror(
  userId: string,
  input: MirrorDriftInput,
  now: Date = new Date(),
): Promise<{ checked: number; changedGameIds: string[] }> {
  const links = await prisma.gameExternalBooking.findMany({
    where: {
      bookedByUserId: userId,
      externalBookingProvider: input.provider,
      game: {
        status: { in: [GameStatus.ANNOUNCED, GameStatus.STARTED] },
        OR: [{ clubId: input.clubId }, { court: { clubId: input.clubId } }],
      },
    },
    select: DRIFT_LINK_SELECT,
  });
  const byId = new Map(input.bookings.map((booking) => [booking.externalBookingId, booking]));
  const changed = new Set<string>();
  let checked = 0;
  for (const link of links) {
    const listed = byId.get(link.externalBookingId);
    let observation: UpstreamObservation;
    if (listed) {
      observation = listed.state === 'CANCELLED' ? { present: false } : { present: true, start: listed.start, end: listed.end };
    } else {
      const start = link.bookingStart?.getTime();
      const inRange = start != null && start >= input.rangeFrom.getTime() && start <= input.rangeTo.getTime();
      if (!input.complete || !inRange) continue;
      observation = { present: false };
    }
    checked += 1;
    if (await applyVerdict(link, classifyUpstream(link, observation), now)) changed.add(link.gameId);
  }
  for (const gameId of changed) {
    await emitGameUpdate(gameId, userId);
  }
  return { checked, changedGameIds: [...changed] };
}

async function loadLinkForGame(gameId: string, linkId: string) {
  const link = await prisma.gameExternalBooking.findFirst({
    where: { id: linkId, gameId },
    select: { ...gameExternalBookingSelect, gameId: true },
  });
  if (!link) throw new ApiError(404, BOOKING_ERROR_KEYS.bookingNotLinked, true, { linkId });
  return link;
}

function parseOptionalInstant(raw: unknown, field: string): Date | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') throw new ApiError(400, `${field} must be an ISO date-time`);
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) throw new ApiError(400, `${field} must be an ISO date-time`);
  return date;
}

export function parseUpstreamCheckBody(body: unknown): UpstreamObservation {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'present is required');
  const src = body as Record<string, unknown>;
  if (typeof src.present !== 'boolean') throw new ApiError(400, 'present must be a boolean');
  if (!src.present) return { present: false };
  const start = parseOptionalInstant(src.start, 'start');
  const end = parseOptionalInstant(src.end, 'end');
  if ((start == null) !== (end == null)) throw new ApiError(400, 'start and end go together');
  if (start && end && end.getTime() <= start.getTime()) throw new ApiError(400, 'end must be after start');
  return { present: true, start, end };
}

/** `POST /games/:id/bookings/:linkId/upstream-check` — the client verified the booking upstream. */
export async function recordUpstreamCheck(
  gameId: string,
  linkId: string,
  userId: string,
  isAdmin: boolean,
  body: unknown,
) {
  if (!(await canMutateGameBookings(gameId, userId, isAdmin))) {
    throw new ApiError(403, BOOKING_ERROR_KEYS.updateLinksForbidden);
  }
  const observation = parseUpstreamCheckBody(body);
  const link = await loadLinkForGame(gameId, linkId);
  const changed = await applyVerdict(link, classifyUpstream(link, observation), new Date());
  if (changed) await emitGameUpdate(gameId, userId);
  const fresh = await loadLinkForGame(gameId, linkId);
  return serializeLinkedBooking(fresh);
}

export type AcceptUpstreamMode = 'move_game' | 'keep_game';

export function parseAcceptUpstreamBody(body: unknown): {
  mode: AcceptUpstreamMode;
  startTime: Date | null;
  endTime: Date | null;
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'mode is required');
  const src = body as Record<string, unknown>;
  if (src.mode !== 'move_game' && src.mode !== 'keep_game') {
    throw new ApiError(400, "mode must be 'move_game' or 'keep_game'");
  }
  const startTime = parseOptionalInstant(src.startTime, 'startTime');
  const endTime = parseOptionalInstant(src.endTime, 'endTime');
  if ((startTime == null) !== (endTime == null)) throw new ApiError(400, 'startTime and endTime go together');
  if (startTime && endTime && endTime.getTime() <= startTime.getTime()) {
    throw new ApiError(400, 'endTime must be after startTime');
  }
  return { mode: src.mode, startTime, endTime };
}

/**
 * New game window when the organizer follows a moved booking: each edge shifts by the same
 * amount as the booking's edge (a booking that spanned the game → the game takes the new
 * booking times). Falls back to the booking's own window when that would not be a window.
 */
export function shiftGameWindowWithBooking(
  game: { startTime: Date; endTime: Date },
  link: { bookingStart: Date | null; bookingEnd: Date | null },
  upstream: { start: Date; end: Date },
): { startTime: Date; endTime: Date } {
  if (link.bookingStart && link.bookingEnd) {
    const startTime = new Date(game.startTime.getTime() + (upstream.start.getTime() - link.bookingStart.getTime()));
    const endTime = new Date(game.endTime.getTime() + (upstream.end.getTime() - link.bookingEnd.getTime()));
    if (endTime.getTime() > startTime.getTime()) return { startTime, endTime };
  }
  return { startTime: upstream.start, endTime: upstream.end };
}

/**
 * `POST /games/:id/bookings/:linkId/accept-upstream` `{ mode, startTime?, endTime? }`.
 * Only for a MOVED link. Both modes set the link to the provider's times (drift → OK):
 * - `keep_game`: the game keeps its time; coverage is recomputed (status notice if changed).
 * - `move_game`: the game moves (`startTime`/`endTime`, default: shifted with the booking)
 *   through `GameUpdateService.updateGame` — one time-change notice, attendance reset,
 *   clash guard — with the link write in the same transaction.
 */
export async function acceptUpstreamDrift(
  gameId: string,
  linkId: string,
  userId: string,
  isAdmin: boolean,
  body: unknown,
) {
  if (!(await canMutateGameBookings(gameId, userId, isAdmin))) {
    throw new ApiError(403, BOOKING_ERROR_KEYS.updateLinksForbidden);
  }
  const { mode, startTime, endTime } = parseAcceptUpstreamBody(body);
  const link = await loadLinkForGame(gameId, linkId);
  if (link.upstreamState !== GameExternalBookingUpstreamState.MOVED || !link.upstreamStart || !link.upstreamEnd) {
    throw new ApiError(409, UPSTREAM_NOT_MOVED_CODE, true, { code: UPSTREAM_NOT_MOVED_CODE });
  }
  const upstream = { start: link.upstreamStart, end: link.upstreamEnd };
  const now = new Date();

  // Conditional on the drift we showed the organizer: a newer observation in between → 409.
  const writeLink = async (tx: Prisma.TransactionClient) => {
    const updated = await tx.gameExternalBooking.updateMany({
      where: {
        id: linkId,
        gameId,
        upstreamState: GameExternalBookingUpstreamState.MOVED,
        upstreamStart: upstream.start,
        upstreamEnd: upstream.end,
      },
      data: { bookingStart: upstream.start, bookingEnd: upstream.end, ...UPSTREAM_IN_SYNC, upstreamCheckedAt: now },
    });
    if (updated.count === 0) {
      throw new ApiError(409, UPSTREAM_NOT_MOVED_CODE, true, { code: UPSTREAM_NOT_MOVED_CODE });
    }
  };

  if (mode === 'keep_game') {
    let previousBookingStatus: string | null = null;
    await runBookingLinkTransaction(gameId, userId, async (tx) => {
      await writeLink(tx);
      const synced = await syncGameBookingState(tx, gameId, { timePolicy: 'explicit', actorUserId: userId });
      previousBookingStatus = synced.previousBookingStatus;
    });
    await notifyGameBookingStatusChangeIfNeeded(gameId, previousBookingStatus);
    await emitGameUpdate(gameId, userId);
  } else {
    const game = await prisma.game.findUnique({ where: { id: gameId }, select: { startTime: true, endTime: true } });
    if (!game) throw new ApiError(404, 'Game not found');
    const window =
      startTime && endTime ? { startTime, endTime } : shiftGameWindowWithBooking(game, link, upstream);
    await GameUpdateService.updateGame(
      gameId,
      { startTime: window.startTime.toISOString(), endTime: window.endTime.toISOString() },
      userId,
      isAdmin,
      { timePolicy: 'explicit', inTx: { beforeSync: writeLink } },
    );
  }

  const rows = await prisma.gameExternalBooking.findMany({
    where: { gameId },
    orderBy: { createdAt: 'asc' },
    select: gameExternalBookingSelect,
  });
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { startTime: true, endTime: true, bookingStatus: true, hasBookedCourt: true },
  });
  return {
    mode,
    startTime: game?.startTime.toISOString() ?? null,
    endTime: game?.endTime.toISOString() ?? null,
    bookingStatus: game?.bookingStatus ?? null,
    hasBookedCourt: game?.hasBookedCourt ?? null,
    linkedBookings: rows.map(serializeLinkedBooking),
  };
}
