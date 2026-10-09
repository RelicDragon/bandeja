/**
 * Court slots — transaction helpers shared by the game-court service and the
 * game ↔ booking sync (docs/domains/booking.md "Court slots").
 *
 * A slot is a `GameCourt` row. Its reservation is either reported by the
 * organizer (`reservation = REPORTED`) or a linked `GameExternalBooking`
 * pointing at it (`gameCourtId`). No imports from `gameExternalBooking.service`
 * here, so both sides can use these without a cycle.
 */
import { GameCourtReservation, Prisma } from '@prisma/client';
import { defaultCourtSlotCount } from '@bandeja/shared/gameBooking/courtReservations';
import { playersPerMatchOf } from '../../shared/matchFormat';

type Tx = Prisma.TransactionClient;

export const COURT_SLOTS_MAX = 16;

export type TimePolicy = 'legacy' | 'explicit';

/** `?timePolicy=explicit` → booking writes never derive/move the game's time. */
export function parseTimePolicy(raw: unknown): TimePolicy {
  return raw === 'explicit' ? 'explicit' : 'legacy';
}

export async function nextSlotOrder(tx: Tx, gameId: string): Promise<number> {
  const max = await tx.gameCourt.aggregate({ where: { gameId }, _max: { order: true } });
  return (max._max.order ?? 0) + 1;
}

/**
 * Write the ordered court list for a game, keeping the rows (and therefore the
 * reservation fields and booking links) of courts that stay. Courts that leave
 * are deleted (their links fall back to `gameCourtId = null` and are re-placed).
 * `initialReservation(courtId)` decides the reservation of newly created slots.
 */
export async function writeOrderedSlots(
  tx: Tx,
  gameId: string,
  courtIds: string[],
  initialReservation: (courtId: string) => { reservation: GameCourtReservation; reportedById?: string | null } = () => ({
    reservation: GameCourtReservation.NONE,
  }),
): Promise<void> {
  const existing = await tx.gameCourt.findMany({ where: { gameId }, select: { id: true, courtId: true } });
  const keep = new Set(courtIds);
  const removeIds = existing.filter((row) => !keep.has(row.courtId)).map((row) => row.id);
  if (removeIds.length > 0) {
    await tx.gameCourt.deleteMany({ where: { id: { in: removeIds } } });
  }
  const byCourt = new Map(existing.filter((row) => keep.has(row.courtId)).map((row) => [row.courtId, row.id]));
  // Park kept rows on negative orders first so `@@unique([gameId, order])` never collides.
  let parked = -1;
  for (const id of byCourt.values()) {
    await tx.gameCourt.update({ where: { id }, data: { order: parked } });
    parked -= 1;
  }
  for (let i = 0; i < courtIds.length; i++) {
    const courtId = courtIds[i];
    const id = byCourt.get(courtId);
    if (id) {
      await tx.gameCourt.update({ where: { id }, data: { order: i + 1 } });
    } else {
      const init = initialReservation(courtId);
      const reported = init.reservation === GameCourtReservation.REPORTED;
      await tx.gameCourt.create({
        data: {
          gameId,
          courtId,
          order: i + 1,
          reservation: init.reservation,
          reportedById: reported ? (init.reportedById ?? null) : null,
          reportedAt: reported ? new Date() : null,
        },
      });
    }
  }
}

/** `Game.courtId` follows the first slot (and fills `clubId` when missing). No slots → untouched. */
export async function syncPrimaryCourtFromSlots(tx: Tx, gameId: string): Promise<void> {
  const first = await tx.gameCourt.findFirst({
    where: { gameId },
    orderBy: { order: 'asc' },
    select: { courtId: true, court: { select: { clubId: true } } },
  });
  if (!first) return;
  const game = await tx.game.findUnique({ where: { id: gameId }, select: { courtId: true, clubId: true } });
  if (!game) return;
  const data: Prisma.GameUncheckedUpdateInput = {};
  if (game.courtId !== first.courtId) data.courtId = first.courtId;
  if (!game.clubId && first.court.clubId) data.clubId = first.court.clubId;
  if (Object.keys(data).length > 0) await tx.game.update({ where: { id: gameId }, data });
}

/**
 * Keep "a game with a primary court has a slot for it" true after writes that
 * only touch `Game.courtId` (PATCH, link gamePatch, create):
 * - no slots → create one for `courtId`;
 * - exactly one slot on another court with no links → move it to `courtId`
 *   (old apps change "the court" with PATCH; the reservation stays — it was game-level);
 * - otherwise leave the slots alone.
 */
export async function ensurePrimaryCourtSlot(tx: Tx, gameId: string, courtId: string | null): Promise<void> {
  if (!courtId) return;
  const slots = await tx.gameCourt.findMany({
    where: { gameId },
    select: { id: true, courtId: true, _count: { select: { externalBookings: true } } },
  });
  if (slots.some((s) => s.courtId === courtId)) return;
  if (slots.length === 0) {
    await tx.gameCourt.create({ data: { gameId, courtId, order: 1 } });
    return;
  }
  if (slots.length === 1 && slots[0]._count.externalBookings === 0) {
    await tx.gameCourt.update({ where: { id: slots[0].id }, data: { courtId } });
  }
}

/**
 * Courts the game may hold: the roster need (a 4-player 2v2 needs one), or the
 * organizer's explicit `courtSlotCount` when higher. Null when the game is gone.
 */
export async function courtCapOf(tx: Tx, gameId: string): Promise<number | null> {
  const game = await tx.game.findUnique({
    where: { id: gameId },
    select: { maxParticipants: true, playersPerMatch: true, sport: true, courtSlotCount: true },
  });
  if (!game) return null;
  const rosterNeed = defaultCourtSlotCount({
    maxParticipants: game.maxParticipants,
    playersPerMatch: playersPerMatchOf(game),
  });
  return Math.max(rosterNeed, game.courtSlotCount ?? 0);
}

/** Slots nothing holds: no linked booking and not reported by the organizer (last first). */
async function emptySlots(tx: Tx, gameId: string): Promise<Array<{ id: string; courtId: string; order: number }>> {
  return tx.gameCourt.findMany({
    where: { gameId, reservation: GameCourtReservation.NONE, externalBookings: { none: {} } },
    orderBy: { order: 'desc' },
    select: { id: true, courtId: true, order: true },
  });
}

/**
 * Drop empty slots while the game holds more courts than it may (a link that added a
 * court was removed, a booking moved court at the club). Never the last slot.
 * Returns true when it removed any.
 */
export async function pruneEmptySlotsAboveCap(tx: Tx, gameId: string): Promise<boolean> {
  const cap = await courtCapOf(tx, gameId);
  if (cap == null) return false;
  const total = await tx.gameCourt.count({ where: { gameId } });
  const excess = total - Math.max(cap, 1);
  if (excess <= 0) return false;
  const removable = (await emptySlots(tx, gameId)).slice(0, excess).map((slot) => slot.id);
  if (removable.length === 0) return false;
  await tx.gameCourt.deleteMany({ where: { id: { in: removable } } });
  return true;
}

/**
 * Put every linked booking on the slot of its court. Links whose slot no longer
 * matches their court are re-placed. With `appendMissing`, a booking on a court
 * the game does not list gets a new slot appended for it (link/snapshot writes);
 * otherwise it stays unplaced (court-set edits must not resurrect removed courts).
 */
export async function placeLinksOnSlots(
  tx: Tx,
  gameId: string,
  options: { appendMissing: boolean; onlyLinkIds?: string[] },
): Promise<void> {
  const links = await tx.gameExternalBooking.findMany({
    where: { gameId, ...(options.onlyLinkIds ? { id: { in: options.onlyLinkIds } } : {}) },
    orderBy: { createdAt: 'asc' },
    select: { id: true, courtId: true, gameCourtId: true },
  });
  if (links.length === 0) return;
  const slots = await tx.gameCourt.findMany({ where: { gameId }, select: { id: true, courtId: true } });
  const slotByCourt = new Map(slots.map((s) => [s.courtId, s.id]));
  const slotCourtById = new Map(slots.map((s) => [s.id, s.courtId]));
  for (const link of links) {
    if (!link.courtId) continue;
    if (link.gameCourtId && slotCourtById.get(link.gameCourtId) === link.courtId) continue;
    let slotId = slotByCourt.get(link.courtId);
    if (!slotId && options.appendMissing) {
      // At the court cap, the booking takes over an empty slot (the court the organizer
      // planned but booked elsewhere) instead of growing the game past what it needs.
      const cap = await courtCapOf(tx, gameId);
      const reusable = cap != null && slotByCourt.size >= cap ? (await emptySlots(tx, gameId))[0] : undefined;
      if (reusable) {
        await tx.gameCourt.update({ where: { id: reusable.id }, data: { courtId: link.courtId } });
        slotByCourt.delete(reusable.courtId);
        slotId = reusable.id;
      } else {
        const created = await tx.gameCourt.create({
          data: { gameId, courtId: link.courtId, order: await nextSlotOrder(tx, gameId) },
          select: { id: true },
        });
        slotId = created.id;
      }
      slotByCourt.set(link.courtId, slotId);
      slotCourtById.set(slotId, link.courtId);
    }
    const next = slotId ?? null;
    if (next !== link.gameCourtId) {
      await tx.gameExternalBooking.update({ where: { id: link.id }, data: { gameCourtId: next } });
    }
  }
  // A booking whose court the provider did not report (court unknown) goes on the first
  // empty slot: the organizer linked it to this game, so it holds one of its courts. After
  // the court-bearing links, and it yields its slot when a booking with that court arrives.
  for (const link of links) {
    if (link.courtId) continue;
    if (link.gameCourtId && slotCourtById.has(link.gameCourtId)) {
      const claimed = await tx.gameExternalBooking.count({
        where: { gameId, gameCourtId: link.gameCourtId, courtId: { not: null } },
      });
      if (claimed === 0) continue;
    }
    const empty = (await emptySlots(tx, gameId)).at(-1);
    if (!empty) continue;
    await tx.gameExternalBooking.update({ where: { id: link.id }, data: { gameCourtId: empty.id } });
  }
}

/**
 * Old-app `hasBookedCourt` → court slots.
 * - `true` on a game with nothing reserved and no links: every slot REPORTED,
 *   or `reportedAnyCourtCount = 1` when the game has no slots.
 * - `false`: clear every REPORTED slot and `reportedAnyCourtCount`. (Callers keep
 *   refusing to clear while links exist.)
 * Returns true when it changed anything.
 */
export async function applyLegacyHasBookedCourt(
  tx: Tx,
  gameId: string,
  value: boolean,
  actorUserId: string | null,
): Promise<boolean> {
  if (!value) {
    const cleared = await tx.gameCourt.updateMany({
      where: { gameId, reservation: GameCourtReservation.REPORTED },
      data: { reservation: GameCourtReservation.NONE, reportedById: null, reportedAt: null },
    });
    const game = await tx.game.updateMany({
      where: { id: gameId, reportedAnyCourtCount: { gt: 0 } },
      data: { reportedAnyCourtCount: 0 },
    });
    return cleared.count > 0 || game.count > 0;
  }
  // Sequential on purpose: one transaction connection.
  const linkCount = await tx.gameExternalBooking.count({ where: { gameId } });
  const reportedCount = await tx.gameCourt.count({
    where: { gameId, reservation: GameCourtReservation.REPORTED },
  });
  const game = await tx.game.findUnique({ where: { id: gameId }, select: { reportedAnyCourtCount: true } });
  if (!game || linkCount > 0 || reportedCount > 0 || game.reportedAnyCourtCount > 0) return false;
  const marked = await tx.gameCourt.updateMany({
    where: { gameId },
    data: { reservation: GameCourtReservation.REPORTED, reportedById: actorUserId, reportedAt: new Date() },
  });
  if (marked.count === 0) {
    await tx.game.update({ where: { id: gameId }, data: { reportedAnyCourtCount: 1 } });
  }
  return true;
}
