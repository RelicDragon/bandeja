import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { assertCourtMatchesGameSport } from '../../shared/clubSports';
import { EntityType, GameBookingStatus, GameCourtReservation, Prisma } from '@prisma/client';
import { assertNoCourtClashInTx } from './courtClash.service';
import { defaultCourtSlotCount } from '@bandeja/shared/gameBooking/courtReservations';
import { playersPerMatchOf } from '../../shared/matchFormat';
import {
  gameExternalBookingSelect,
  recomputeGameBookingStatusForGame,
  runBookingLinkTransaction,
  serializeLinkedBooking,
  syncGameBookingState,
} from '../game/gameExternalBooking.service';
import { notifyGameBookingStatusChangeIfNeeded } from '../game/notifyGameBookingStatusChange';
import {
  COURT_SLOTS_MAX,
  placeLinksOnSlots,
  syncPrimaryCourtFromSlots,
  writeOrderedSlots,
  type TimePolicy,
} from './courtSlots.tx';

export type CourtSlotsBody = {
  slots: Array<{ courtId: string; reservation: GameCourtReservation }>;
  reportedAnyCourtCount: number;
  /** `Game.courtSlotCount`: absent = unchanged, null = clear (default rule), 1..16 = set. */
  courtSlotCount?: number | null;
};

export function parseCourtSlotsBody(body: unknown): CourtSlotsBody {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'slots must be an array');
  }
  const src = body as Record<string, unknown>;
  if (!Array.isArray(src.slots)) throw new ApiError(400, 'slots must be an array');
  if (src.slots.length > COURT_SLOTS_MAX) {
    throw new ApiError(400, `At most ${COURT_SLOTS_MAX} court slots`);
  }
  const seen = new Set<string>();
  const slots = src.slots.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ApiError(400, 'Invalid slot');
    const row = raw as Record<string, unknown>;
    const courtId = typeof row.courtId === 'string' ? row.courtId.trim() : '';
    if (!courtId) throw new ApiError(400, 'slot.courtId is required');
    if (seen.has(courtId)) throw new ApiError(400, 'Duplicate court in slots');
    seen.add(courtId);
    const reservation = row.reservation ?? GameCourtReservation.NONE;
    if (reservation !== GameCourtReservation.NONE && reservation !== GameCourtReservation.REPORTED) {
      throw new ApiError(400, 'slot.reservation must be NONE or REPORTED');
    }
    return { courtId, reservation: reservation as GameCourtReservation };
  });
  const rawCount = src.reportedAnyCourtCount ?? 0;
  if (typeof rawCount !== 'number' || !Number.isInteger(rawCount) || rawCount < 0 || rawCount > COURT_SLOTS_MAX) {
    throw new ApiError(400, `reportedAnyCourtCount must be an integer 0..${COURT_SLOTS_MAX}`);
  }
  const parsed: CourtSlotsBody = { slots, reportedAnyCourtCount: rawCount };
  if (src.courtSlotCount !== undefined) {
    const n = src.courtSlotCount;
    if (n !== null && (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > COURT_SLOTS_MAX)) {
      throw new ApiError(400, `courtSlotCount must be null or an integer 1..${COURT_SLOTS_MAX}`);
    }
    parsed.courtSlotCount = n;
  }
  return parsed;
}


export class GameCourtService {
  static async getGameCourts(gameId: string) {
    const gameCourts = await prisma.gameCourt.findMany({
      where: { gameId },
      include: {
        court: {
          include: {
            club: {
              select: {
                id: true,
                name: true,
                address: true,
              },
            },
          },
        },
      },
      orderBy: { order: 'asc' },
    });

    return gameCourts;
  }

  /**
   * Replace the game's ordered court list (old apps + create). Rows of courts that stay keep
   * their reservation and booking links; `Game.courtId` follows the first slot. A new court
   * starts REPORTED only when the game is "court booked" by report alone (no links) and every
   * existing slot is already REPORTED — the old app's game-level toggle.
   */
  static async setGameCourts(
    gameId: string,
    courtIds: string[],
    options: { notify?: boolean; actorUserId?: string | null } = {},
  ) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { sport: true, clubId: true },
    });
    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    const uniqueCourtIds = Array.from(new Set(courtIds));
    let previousBookingStatus: GameBookingStatus | null = null;

    await runBookingLinkTransaction(gameId, null, async (tx) => {
      for (const courtId of uniqueCourtIds) {
        const court = await tx.court.findUnique({ where: { id: courtId } });
        if (!court) {
          throw new ApiError(404, `Court ${courtId} not found`);
        }
        if (game.clubId && court.clubId !== game.clubId) {
          throw new ApiError(400, "Courts must belong to the game's club");
        }
        assertCourtMatchesGameSport(court.sport, game.sport);
      }

      const existing = await tx.gameCourt.findMany({ where: { gameId }, select: { reservation: true } });
      const linkCount = await tx.gameExternalBooking.count({ where: { gameId } });
      const current = await tx.game.findUnique({
        where: { id: gameId },
        select: { hasBookedCourt: true, courtId: true },
      });
      const inheritReported =
        linkCount === 0 &&
        Boolean(current?.hasBookedCourt) &&
        existing.length > 0 &&
        existing.every((row) => row.reservation === GameCourtReservation.REPORTED);

      // An empty list keeps the primary court's slot: `Game.courtId` is cleared through the game
      // itself (old apps PATCH `courtId` first), and a game with a court always has its slot.
      const target =
        uniqueCourtIds.length === 0 && current?.courtId ? [current.courtId] : uniqueCourtIds;

      await writeOrderedSlots(tx, gameId, target, () =>
        inheritReported
          ? { reservation: GameCourtReservation.REPORTED, reportedById: options.actorUserId ?? null }
          : { reservation: GameCourtReservation.NONE },
      );
      await syncPrimaryCourtFromSlots(tx, gameId);
      await placeLinksOnSlots(tx, gameId, { appendMissing: false });
      const synced = await syncGameBookingState(tx, gameId, { slotsAuthoritative: true });
      previousBookingStatus = synced.previousBookingStatus;
    });

    if (options.notify !== false) {
      await notifyGameBookingStatusChangeIfNeeded(gameId, previousBookingStatus);
    }
    return this.getGameCourts(gameId);
  }

  /**
   * `PUT /games/:id/court-slots` — the court-slots editor. Slots are authoritative:
   * order, courts and per-court reservation, plus `reportedAnyCourtCount` and the optional
   * organizer-chosen `courtSlotCount` (absent = unchanged, null = default rule).
   */
  static async setCourtSlots(
    gameId: string,
    userId: string,
    body: unknown,
    options: { timePolicy?: TimePolicy } = {},
  ) {
    let previousBookingStatus: GameBookingStatus | null = null;
    await runBookingLinkTransaction(gameId, userId, async (tx) => {
      previousBookingStatus = (await this.writeCourtSlotsInTx(tx, gameId, userId, body, options)).previousBookingStatus;
    });
    await notifyGameBookingStatusChangeIfNeeded(gameId, previousBookingStatus);
    return this.getCourtSlotView(gameId);
  }

  /**
   * The court-slots write inside the caller's transaction (PUT court-slots, reschedule
   * save-game). The caller owns schedule tracking and the booking-status notice.
   */
  static async writeCourtSlotsInTx(
    tx: Prisma.TransactionClient,
    gameId: string,
    userId: string,
    body: unknown,
    options: { timePolicy?: TimePolicy } = {},
  ): Promise<{ previousBookingStatus: GameBookingStatus }> {
    const input = parseCourtSlotsBody(body);
    const game = await tx.game.findUnique({
      where: { id: gameId },
      select: { sport: true, clubId: true, entityType: true, maxParticipants: true, playersPerMatch: true, courtSlotCount: true },
    });
    if (!game) throw new ApiError(404, 'Game not found');
    if (game.entityType === EntityType.EVENT) {
      throw new ApiError(400, 'EVENT listings cannot book courts');
    }

    const courtIds = input.slots.map((slot) => slot.courtId);
    if (courtIds.length > 0) {
      const courts = await tx.court.findMany({
        where: { id: { in: courtIds } },
        select: { id: true, clubId: true, sport: true },
      });
      if (courts.length !== courtIds.length) throw new ApiError(404, 'Court not found');
      const clubIds = new Set(courts.map((court) => court.clubId));
      const expectedClubId = game.clubId ?? courts[0].clubId;
      if (clubIds.size !== 1 || !clubIds.has(expectedClubId)) {
        throw new ApiError(400, "Courts must belong to the game's club");
      }
      for (const court of courts) assertCourtMatchesGameSport(court.sport, game.sport);
    }

    const before = await tx.gameCourt.findMany({
      where: { gameId },
      select: { id: true, courtId: true, reservation: true, _count: { select: { externalBookings: true } } },
    });
    const beforeByCourt = new Map(before.map((row) => [row.courtId, row]));

    // Never more courts than the roster needs (a 4-player 2v2 has one). A game already
    // above that (older data, or linked reservations) may keep its courts but not grow.
    const rosterNeed = defaultCourtSlotCount({
      maxParticipants: game.maxParticipants,
      playersPerMatch: playersPerMatchOf(game),
    });
    const allowed = Math.max(rosterNeed, game.courtSlotCount ?? 0);
    const courtCap = Math.max(allowed, before.length);
    // Above the cap (older data, an extra linked court) the game may keep or drop courts, not add new ones.
    const addsCourtAboveCap =
      courtIds.length > allowed && courtIds.some((courtId) => !beforeByCourt.has(courtId));
    if (
      courtIds.length > courtCap ||
      addsCourtAboveCap ||
      (typeof input.courtSlotCount === 'number' && input.courtSlotCount > courtCap)
    ) {
      throw new ApiError(400, `This game needs at most ${rosterNeed} court${rosterNeed === 1 ? '' : 's'}`);
    }
    const keep = new Set(courtIds);
    if (before.some((row) => !keep.has(row.courtId) && row._count.externalBookings > 0)) {
      // A linked booking is never dropped implicitly: unlink it (PATCH /games/:id/bookings) first.
      throw new ApiError(400, 'A court with a linked booking cannot be removed; unlink the booking first');
    }

    await writeOrderedSlots(tx, gameId, courtIds, (courtId) => {
      const wanted = input.slots.find((slot) => slot.courtId === courtId)!;
      return { reservation: wanted.reservation, reportedById: userId };
    });

    const now = new Date();
    for (const slot of input.slots) {
      const prev = beforeByCourt.get(slot.courtId);
      if (!prev || prev.reservation === slot.reservation) continue;
      await tx.gameCourt.update({
        where: { id: prev.id },
        data:
          slot.reservation === GameCourtReservation.REPORTED
            ? { reservation: GameCourtReservation.REPORTED, reportedById: userId, reportedAt: now }
            : { reservation: GameCourtReservation.NONE, reportedById: null, reportedAt: null },
      });
    }

    await tx.game.update({
      where: { id: gameId },
      data: {
        reportedAnyCourtCount: input.reportedAnyCourtCount,
        ...(input.courtSlotCount !== undefined ? { courtSlotCount: input.courtSlotCount } : {}),
        ...(courtIds.length > 0 ? {} : { courtId: null }),
      },
    });
    await syncPrimaryCourtFromSlots(tx, gameId);
    await placeLinksOnSlots(tx, gameId, { appendMissing: false });
    const synced = await syncGameBookingState(tx, gameId, {
      slotsAuthoritative: true,
      timePolicy: 'explicit',
      actorUserId: userId,
    });

    // New clients: a court added by this request must not clash (409 `court.clash`).
    if (options.timePolicy === 'explicit') {
      const added = new Set(courtIds.filter((courtId) => !beforeByCourt.has(courtId)));
      await assertNoCourtClashInTx(tx, gameId, { onlyCourtIds: added });
    }
    return { previousBookingStatus: synced.previousBookingStatus };
  }

  /** Slot view: ordered slots with reservation fields, links with `gameCourtId`, any-court count, `courtSlotCount`. */
  static async getCourtSlotView(gameId: string) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        id: true,
        courtId: true,
        hasBookedCourt: true,
        bookingStatus: true,
        courtBookingMode: true,
        reportedAnyCourtCount: true,
        courtSlotCount: true,
        externalBookings: { orderBy: { createdAt: 'asc' }, select: gameExternalBookingSelect },
      },
    });
    if (!game) throw new ApiError(404, 'Game not found');
    const gameCourts = await this.getGameCourts(gameId);
    return {
      gameId: game.id,
      courtId: game.courtId,
      hasBookedCourt: game.hasBookedCourt,
      bookingStatus: game.bookingStatus,
      courtBookingMode: game.courtBookingMode,
      reportedAnyCourtCount: game.reportedAnyCourtCount,
      courtSlotCount: game.courtSlotCount,
      gameCourts,
      linkedBookings: game.externalBookings.map(serializeLinkedBooking),
    };
  }

  static async addGameCourt(gameId: string, courtId: string) {
    const existingGameCourt = await prisma.gameCourt.findFirst({
      where: {
        gameId,
        courtId,
      },
    });

    if (existingGameCourt) {
      throw new ApiError(400, 'Court already added to game');
    }

    const court = await prisma.court.findUnique({
      where: { id: courtId },
    });

    if (!court) {
      throw new ApiError(404, 'Court not found');
    }
    // Old-app endpoint: same club and sport rules as PUT court-slots.
    const owner = await prisma.game.findUnique({ where: { id: gameId }, select: { clubId: true, sport: true } });
    if (!owner) throw new ApiError(404, 'Game not found');
    if (owner.clubId && court.clubId !== owner.clubId) {
      throw new ApiError(400, "Courts must belong to the game's club");
    }
    assertCourtMatchesGameSport(court.sport, owner.sport);

    const maxOrder = await prisma.gameCourt.findFirst({
      where: { gameId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const newOrder = (maxOrder?.order ?? 0) + 1;
    const hadSlots = maxOrder !== null;

    const gameCourt = await prisma.gameCourt.create({
      data: {
        gameId,
        courtId,
        order: newOrder,
      },
      include: {
        court: {
          include: {
            club: {
              select: {
                id: true,
                name: true,
                address: true,
              },
            },
          },
        },
      },
    });

    if (!hadSlots) {
      await prisma.$transaction((tx) => syncPrimaryCourtFromSlots(tx, gameId));
    }
    await recomputeGameBookingStatusForGame(gameId);
    return gameCourt;
  }

  static async removeGameCourt(gameId: string, gameCourtId: string) {
    const gameCourt = await prisma.gameCourt.findUnique({
      where: { id: gameCourtId },
    });

    if (!gameCourt || gameCourt.gameId !== gameId) {
      throw new ApiError(404, 'Game court not found');
    }

    await prisma.$transaction(async (tx) => {
      await tx.gameCourt.delete({
        where: { id: gameCourtId },
      });

      const remainingCourts = await tx.gameCourt.findMany({
        where: { gameId },
        orderBy: { order: 'asc' },
      });

      for (let i = 0; i < remainingCourts.length; i++) {
        await tx.gameCourt.update({
          where: { id: remainingCourts[i].id },
          data: { order: i + 1 },
        });
      }
      await syncPrimaryCourtFromSlots(tx, gameId);
      await placeLinksOnSlots(tx, gameId, { appendMissing: false });
    });

    await recomputeGameBookingStatusForGame(gameId);
    return { success: true };
  }

  static async reorderGameCourts(gameId: string, gameCourtIds: string[]) {
    const existingGameCourts = await prisma.gameCourt.findMany({
      where: { gameId },
    });

    // Exactly this game's slots: ids from another game must never be reordered through this one.
    const own = new Set(existingGameCourts.map((row) => row.id));
    if (
      existingGameCourts.length !== gameCourtIds.length ||
      new Set(gameCourtIds).size !== gameCourtIds.length ||
      gameCourtIds.some((id) => !own.has(id))
    ) {
      throw new ApiError(400, 'Invalid number of game courts');
    }

    await prisma.$transaction(async (tx) => {
      // Park first: `@@unique([gameId, order])` would collide on a swap.
      for (let i = 0; i < gameCourtIds.length; i++) {
        await tx.gameCourt.update({ where: { id: gameCourtIds[i] }, data: { order: -(i + 1) } });
      }
      for (let i = 0; i < gameCourtIds.length; i++) {
        await tx.gameCourt.update({ where: { id: gameCourtIds[i] }, data: { order: i + 1 } });
      }
      await syncPrimaryCourtFromSlots(tx, gameId);
    });

    return this.getGameCourts(gameId);
  }
}

