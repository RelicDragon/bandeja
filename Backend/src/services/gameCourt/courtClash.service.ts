/**
 * Hard-clash guard for new clients (`?timePolicy=explicit`, docs/domains/booking.md
 * "Clash guard"). Old clients never reach this.
 *
 * A court slot of the game clashes when, inside the part of the game window this game
 * has **not** reserved itself on that court, the court is held by:
 *  - the club's own system (`external` snapshot block) → `club`,
 *  - a club-admin hold → `hold`,
 *  - another app game whose slot on that court is reserved → `app_game_reserved`.
 * "Not reserved itself": a planned slot checks the whole window; a linked slot only its
 * gaps (its own bookings show up in the club snapshot); a REPORTED slot is exempt (the
 * organizer's phone booking shows up as club-busy too — the reschedule planner turns it
 * into "tell the club"). Games sharing one of this game's bookings never clash with it.
 * A "Game only" game (`courtBookingMode = GAME_ONLY`) is never checked.
 */
import { CourtBookingMode, EntityType, GameCourtReservation, GameStatus, Prisma } from '@prisma/client';
import { computeCoverageGapsMs, intervalsOverlap, mergeIntervals, type MsInterval } from '@bandeja/shared/gameBooking/coverageIntervals';
import { ApiError } from '../../utils/ApiError';
import {
  CourtOccupancyService,
  isOccupancyReservedGameBlock,
  type OccupancyBlock,
} from '../game/courtOccupancy.service';

type Tx = Prisma.TransactionClient;

export const COURT_CLASH_CODE = 'court.clash';

export type CourtClashKind = 'club' | 'hold' | 'app_game_reserved';

export type CourtClash = {
  courtId: string;
  start: string;
  end: string;
  kind: CourtClashKind;
  /** `app_game_reserved` only: the other game. */
  gameId?: string;
};

export type ClashSlotInput = {
  courtId: string;
  reservation: GameCourtReservation | 'NONE' | 'REPORTED';
  /** This game's linked bookings on the slot. */
  links: Array<{ start: Date | null; end: Date | null }>;
};

function toMs(d: Date | string | null | undefined): number | null {
  if (d == null) return null;
  const ms = d instanceof Date ? d.getTime() : Date.parse(d);
  return Number.isFinite(ms) ? ms : null;
}

function linkIntervals(links: ClashSlotInput['links']): MsInterval[] {
  const out: MsInterval[] = [];
  for (const link of links) {
    const start = toMs(link.start);
    const end = toMs(link.end);
    if (start != null && end != null && end > start) out.push({ start, end });
  }
  return mergeIntervals(out);
}

/** Pure core of the guard. */
export function findCourtClashes(params: {
  gameId: string;
  window: { start: Date; end: Date };
  slots: readonly ClashSlotInput[];
  blocks: readonly OccupancyBlock[];
  /** Other games sharing one of this game's bookings. */
  sharedGameIds?: ReadonlySet<string>;
  /** Only these courts are checked (e.g. courts added by this request). */
  onlyCourtIds?: ReadonlySet<string>;
}): CourtClash[] {
  const windowStart = params.window.start.getTime();
  const windowEnd = params.window.end.getTime();
  if (!(windowEnd > windowStart)) return [];
  const window: MsInterval = { start: windowStart, end: windowEnd };
  const out: CourtClash[] = [];
  const seen = new Set<string>();

  for (const slot of params.slots) {
    if (params.onlyCourtIds && !params.onlyCourtIds.has(slot.courtId)) continue;
    if (slot.reservation === GameCourtReservation.REPORTED) continue;
    const own = linkIntervals(slot.links);
    const open = own.length > 0 ? computeCoverageGapsMs(window, own) : [window];
    if (open.length === 0) continue;

    for (const block of params.blocks) {
      if (block.courtId !== slot.courtId) continue;
      let kind: CourtClashKind | null = null;
      if (block.kind === 'external') kind = 'club';
      else if (block.kind === 'hold') kind = 'hold';
      else if (
        block.kind === 'game' &&
        block.gameId &&
        block.gameId !== params.gameId &&
        !params.sharedGameIds?.has(block.gameId) &&
        isOccupancyReservedGameBlock(block)
      ) {
        kind = 'app_game_reserved';
      }
      if (!kind) continue;
      const start = toMs(block.startTime);
      const end = toMs(block.endTime);
      if (start == null || end == null || !(end > start)) continue;
      const interval = { start, end };
      if (!open.some((gap) => intervalsOverlap(gap, interval))) continue;
      const key = `${slot.courtId}|${start}|${end}|${kind}|${block.gameId ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        courtId: slot.courtId,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        kind,
        ...(kind === 'app_game_reserved' && block.gameId ? { gameId: block.gameId } : {}),
      });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.courtId.localeCompare(b.courtId));
}

export function courtClashError(clashes: CourtClash[]): ApiError {
  return new ApiError(409, COURT_CLASH_CODE, true, { code: COURT_CLASH_CODE, details: clashes });
}

/**
 * Reads the game (slots, links) through `tx` — so writes of the same transaction are seen —
 * and the club's occupancy outside it, then throws 409 `court.clash` when a slot clashes.
 * Throwing inside the caller's transaction rolls its write back.
 */
export async function assertNoCourtClashInTx(
  tx: Tx,
  gameId: string,
  options: { onlyCourtIds?: ReadonlySet<string> } = {},
): Promise<void> {
  if (options.onlyCourtIds && options.onlyCourtIds.size === 0) return;
  const game = await tx.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      clubId: true,
      startTime: true,
      endTime: true,
      timeIsSet: true,
      entityType: true,
      status: true,
      courtBookingMode: true,
      court: { select: { clubId: true } },
      gameCourts: { select: { id: true, courtId: true, reservation: true } },
      externalBookings: {
        select: { externalBookingId: true, gameCourtId: true, courtId: true, bookingStart: true, bookingEnd: true },
      },
    },
  });
  if (!game || !game.timeIsSet || game.entityType === EntityType.EVENT) return;
  // "Game only": the organizer handles the court; the club's schedule is never checked.
  if (game.courtBookingMode === CourtBookingMode.GAME_ONLY) return;
  if (game.status !== GameStatus.ANNOUNCED && game.status !== GameStatus.STARTED) return;
  const clubId = game.clubId ?? game.court?.clubId ?? null;
  if (!clubId || game.gameCourts.length === 0) return;

  const slotIds = new Set(game.gameCourts.map((slot) => slot.id));
  const slots: ClashSlotInput[] = game.gameCourts.map((slot) => ({
    courtId: slot.courtId,
    reservation: slot.reservation,
    links: game.externalBookings
      .filter(
        (link) =>
          link.gameCourtId === slot.id ||
          ((!link.gameCourtId || !slotIds.has(link.gameCourtId)) && link.courtId === slot.courtId),
      )
      .map((link) => ({ start: link.bookingStart, end: link.bookingEnd })),
  }));

  const ownBookingIds = game.externalBookings.map((link) => link.externalBookingId);
  const sharers =
    ownBookingIds.length > 0
      ? await tx.gameExternalBooking.findMany({
          where: { externalBookingId: { in: ownBookingIds }, gameId: { not: gameId } },
          select: { gameId: true },
        })
      : [];

  const { blocks } = await CourtOccupancyService.getOccupancy({
    clubId,
    rangeStart: game.startTime,
    rangeEnd: game.endTime,
    includeUnmapped: false,
  });

  const clashes = findCourtClashes({
    gameId,
    window: { start: game.startTime, end: game.endTime },
    slots,
    blocks,
    sharedGameIds: new Set(sharers.map((row) => row.gameId)),
    onlyCourtIds: options.onlyCourtIds,
  });
  if (clashes.length > 0) throw courtClashError(clashes);
}
