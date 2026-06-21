import { ClubIntegrationType, GameBookingStatus, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { BOOKING_ERROR_KEYS } from '@bandeja/shared/booking/errorKeys';
import { computeGameBookingStatus } from '@bandeja/shared/gameBooking/computeGameBookingStatus';
import { ApiError } from '../../utils/ApiError';
import { ingestBookingSnapshotTimes } from '../../shared/booktime/ingest';
import { parseBooktimeStoredOrNaiveToDate } from '../../shared/booktime/localTime';
import { resolveBooktimeTimezoneForGame } from '../../shared/booktime/resolveClubTimezone';
import { deriveGameTimeFromBookings } from '../../shared/gameBooking/deriveGameTimeFromBookings';
import {
  LEGACY_EXTERNAL_BOOKING_ID_REJECTED,
  type BookingSnapshotInput,
  type LinkBookingToGameBody,
  type LinkBookingToGamePatch,
} from '../../shared/gameBooking/contracts';
import { canMutateGameBookings } from '../../shared/gameBooking/bookingLinkAuthorization';

type Tx = Prisma.TransactionClient;

/** Game PATCH fields that can change computed bookingStatus (keep in sync with update/create flows). */
export const BOOKING_STATUS_AFFECTING_GAME_FIELDS = [
  'hasBookedCourt',
  'startTime',
  'endTime',
  'timeIsSet',
  'timeOverride',
  'maxParticipants',
  'playersPerMatch',
  'courtId',
  'clubId',
] as const;

export function gamePatchAffectsBookingStatus(patch: Record<string, unknown>): boolean {
  return BOOKING_STATUS_AFFECTING_GAME_FIELDS.some((key) =>
    Object.prototype.hasOwnProperty.call(patch, key),
  );
}

/**
 * Booking status sync entry points (must all call syncGameBookingState):
 * - POST /games (create) — create.service transaction
 * - PATCH /games/:id — update.service transaction (when patch affects status fields)
 * - PATCH /games/:id/bookings — patchGameBookings
 * - POST /games/:id/link-booking — linkBookingToGame
 * - PUT /games/:id/booking-snapshots — putGameBookingSnapshots
 * - scripts/fix-booktime-game-times — maintenance batch fix
 */

export function assertNoLegacyExternalBookingId(data: Record<string, unknown>): void {
  if (Object.prototype.hasOwnProperty.call(data, 'externalBookingId')) {
    throw new ApiError(400, LEGACY_EXTERNAL_BOOKING_ID_REJECTED);
  }
}

export function assertNoLegacyExternalBookingFieldsOnUpdate(data: Record<string, unknown>): void {
  assertNoLegacyExternalBookingId(data);
  if (Object.prototype.hasOwnProperty.call(data, 'externalBookingProvider')) {
    throw new ApiError(400, LEGACY_EXTERNAL_BOOKING_ID_REJECTED);
  }
}

export function parseExternalBookingIds(data: { externalBookingIds?: unknown }): string[] {
  if (!Array.isArray(data.externalBookingIds)) return [];
  return Array.from(
    new Set(
      data.externalBookingIds
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        .map((id) => id.trim()),
    ),
  );
}

export function parseBookingSnapshots(data: { bookingSnapshots?: unknown }): BookingSnapshotInput[] {
  if (!Array.isArray(data.bookingSnapshots)) return [];
  const out: BookingSnapshotInput[] = [];
  for (const row of data.bookingSnapshots) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const externalBookingId = (row as Record<string, unknown>).externalBookingId;
    if (typeof externalBookingId !== 'string' || !externalBookingId.trim()) continue;
    const snap: BookingSnapshotInput = { externalBookingId: externalBookingId.trim() };
    const courtId = (row as Record<string, unknown>).courtId;
    if (typeof courtId === 'string' && courtId.trim()) snap.courtId = courtId.trim();
    const bookingStart = (row as Record<string, unknown>).bookingStart;
    if (typeof bookingStart === 'string' && bookingStart.trim()) snap.bookingStart = bookingStart.trim();
    const bookingEnd = (row as Record<string, unknown>).bookingEnd;
    if (typeof bookingEnd === 'string' && bookingEnd.trim()) snap.bookingEnd = bookingEnd.trim();
    out.push(snap);
  }
  return out;
}

function parseLinkGamePatch(raw: unknown): LinkBookingToGamePatch | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const src = raw as Record<string, unknown>;
  const patch: LinkBookingToGamePatch = {};
  let hasField = false;

  if (typeof src.clubId === 'string' && src.clubId.trim()) {
    patch.clubId = src.clubId.trim();
    hasField = true;
  }
  if (typeof src.courtId === 'string' && src.courtId.trim()) {
    patch.courtId = src.courtId.trim();
    hasField = true;
  }
  if (typeof src.startTime === 'string' && src.startTime.trim()) {
    patch.startTime = src.startTime.trim();
    hasField = true;
  }
  if (typeof src.endTime === 'string' && src.endTime.trim()) {
    patch.endTime = src.endTime.trim();
    hasField = true;
  }
  if (typeof src.timeIsSet === 'boolean') {
    patch.timeIsSet = src.timeIsSet;
    hasField = true;
  }
  if (typeof src.hasBookedCourt === 'boolean') {
    patch.hasBookedCourt = src.hasBookedCourt;
    hasField = true;
  }

  return hasField ? patch : undefined;
}

function parseSingleSnapshot(raw: unknown): BookingSnapshotInput | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const externalBookingId = (raw as Record<string, unknown>).externalBookingId;
  if (typeof externalBookingId !== 'string' || !externalBookingId.trim()) return null;
  const snap: BookingSnapshotInput = { externalBookingId: externalBookingId.trim() };
  const courtId = (raw as Record<string, unknown>).courtId;
  if (typeof courtId === 'string' && courtId.trim()) snap.courtId = courtId.trim();
  const bookingStart = (raw as Record<string, unknown>).bookingStart;
  if (typeof bookingStart === 'string' && bookingStart.trim()) snap.bookingStart = bookingStart.trim();
  const bookingEnd = (raw as Record<string, unknown>).bookingEnd;
  if (typeof bookingEnd === 'string' && bookingEnd.trim()) snap.bookingEnd = bookingEnd.trim();
  return snap;
}

export function parseLinkBookingToGameBody(body: unknown): LinkBookingToGameBody {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, BOOKING_ERROR_KEYS.snapshotsRequired);
  }
  const src = body as Record<string, unknown>;
  const externalBookingId =
    typeof src.externalBookingId === 'string' ? src.externalBookingId.trim() : '';
  if (!externalBookingId) {
    throw new ApiError(400, BOOKING_ERROR_KEYS.patchRequiresBookingId);
  }
  const snapshot = parseSingleSnapshot(src.snapshot);
  if (!snapshot) {
    throw new ApiError(400, BOOKING_ERROR_KEYS.snapshotsRequired);
  }
  if (snapshot.externalBookingId !== externalBookingId) {
    throw new ApiError(400, BOOKING_ERROR_KEYS.snapshotsRequired);
  }
  return {
    externalBookingId,
    snapshot,
    gamePatch: parseLinkGamePatch(src.gamePatch),
  };
}

function snapshotMap(snapshots: BookingSnapshotInput[]): Map<string, BookingSnapshotInput> {
  const map = new Map<string, BookingSnapshotInput>();
  for (const snap of snapshots) {
    map.set(snap.externalBookingId, snap);
  }
  return map;
}

function snapshotToRowData(
  snap: BookingSnapshotInput | undefined,
  timeZone: string,
): Pick<Prisma.GameExternalBookingCreateManyInput, 'courtId' | 'bookingStart' | 'bookingEnd'> {
  const { bookingStart, bookingEnd } = ingestBookingSnapshotTimes(
    snap?.bookingStart,
    snap?.bookingEnd,
    timeZone,
  );
  return {
    courtId: snap?.courtId ?? null,
    bookingStart,
    bookingEnd,
  };
}

export function serializeLinkedBooking(row: {
  id: string;
  externalBookingId: string;
  externalBookingProvider: ClubIntegrationType;
  courtId: string | null;
  bookingStart: Date | null;
  bookingEnd: Date | null;
}) {
  return {
    id: row.id,
    externalBookingId: row.externalBookingId,
    externalBookingProvider: row.externalBookingProvider,
    ...(row.courtId ? { courtId: row.courtId } : {}),
    ...(row.bookingStart ? { bookingStart: row.bookingStart.toISOString() } : {}),
    ...(row.bookingEnd ? { bookingEnd: row.bookingEnd.toISOString() } : {}),
  };
}

export const gameExternalBookingSelect = {
  id: true,
  externalBookingId: true,
  externalBookingProvider: true,
  courtId: true,
  bookingStart: true,
  bookingEnd: true,
} as const;

export const gameExternalBookingInclude = {
  orderBy: { createdAt: 'asc' as const },
  select: gameExternalBookingSelect,
};

export async function insertJoinRows(
  tx: Tx,
  gameId: string,
  externalBookingIds: string[],
  provider: ClubIntegrationType,
  snapshots: BookingSnapshotInput[],
  timeZone: string,
): Promise<void> {
  if (externalBookingIds.length === 0) return;
  const snaps = snapshotMap(snapshots);
  await tx.gameExternalBooking.createMany({
    data: externalBookingIds.map((externalBookingId) => ({
      gameId,
      externalBookingId,
      externalBookingProvider: provider,
      ...snapshotToRowData(snaps.get(externalBookingId), timeZone),
    })),
  });
}

export async function deriveGameTimesFromJoinRows(
  gameId: string,
  tx?: Tx,
): Promise<{ startTime: Date; endTime: Date } | null> {
  const client = tx ?? prisma;
  const rows = await client.gameExternalBooking.findMany({
    where: { gameId },
    select: { bookingStart: true, bookingEnd: true },
  });
  const derived = deriveGameTimeFromBookings(
    rows.map((row) => ({
      bookingStart: row.bookingStart?.toISOString() ?? null,
      bookingEnd: row.bookingEnd?.toISOString() ?? null,
    })),
  );
  if (!derived.startTime || !derived.endTime) return null;
  return { startTime: new Date(derived.startTime), endTime: new Date(derived.endTime) };
}

async function syncGameBookingState(
  tx: Tx,
  gameId: string,
  options?: { clearBookedCourtWhenUnlinked?: boolean },
): Promise<void> {
  const game = await tx.game.findUnique({
    where: { id: gameId },
    select: {
      timeOverride: true,
      courtId: true,
      clubId: true,
      hasBookedCourt: true,
      timeIsSet: true,
      startTime: true,
      endTime: true,
      maxParticipants: true,
      playersPerMatch: true,
    },
  });
  if (!game) throw new ApiError(404, 'Game not found');

  const bookingRows = await tx.gameExternalBooking.findMany({
    where: { gameId },
    orderBy: { createdAt: 'asc' },
    select: {
      bookingStart: true,
      bookingEnd: true,
    },
  });

  const timeZone = await resolveBooktimeTimezoneForGame(gameId);
  const effectiveHasBookedCourt =
    bookingRows.length > 0
      ? true
      : options?.clearBookedCourtWhenUnlinked
        ? false
        : game.hasBookedCourt;

  const bookingStatus = computeGameBookingStatus({
    linkedBookings: bookingRows.map((row) => ({
      bookingStart: row.bookingStart?.toISOString() ?? null,
      bookingEnd: row.bookingEnd?.toISOString() ?? null,
    })),
    hasBookedCourt: effectiveHasBookedCourt,
    timeIsSet: game.timeIsSet,
    startTime: game.startTime.toISOString(),
    endTime: game.endTime.toISOString(),
    maxParticipants: game.maxParticipants,
    playersPerMatch: game.playersPerMatch,
    courtId: game.courtId,
    clubId: game.clubId,
    timeZone,
  }) as GameBookingStatus;

  const patch: Prisma.GameUncheckedUpdateInput = {
    bookingStatus,
  };

  if (bookingRows.length > 0) {
    patch.hasBookedCourt = true;
  } else if (options?.clearBookedCourtWhenUnlinked) {
    patch.hasBookedCourt = false;
  }

  if (!game.timeOverride && bookingRows.length > 0) {
    const derived = await deriveGameTimesFromJoinRows(gameId, tx);
    if (derived) {
      patch.startTime = derived.startTime;
      patch.endTime = derived.endTime;
      patch.timeIsSet = true;
    }
  }

  if (!game.courtId && bookingRows.length > 0) {
    const bookingWithCourt = await tx.gameExternalBooking.findFirst({
      where: { gameId, courtId: { not: null } },
      orderBy: { createdAt: 'asc' },
      select: { courtId: true },
    });
    if (bookingWithCourt?.courtId) {
      patch.courtId = bookingWithCourt.courtId;
      if (!game.clubId) {
        const court = await tx.court.findUnique({
          where: { id: bookingWithCourt.courtId },
          select: { clubId: true },
        });
        if (court?.clubId) {
          patch.clubId = court.clubId;
        }
      }
    }
  }

  await tx.game.update({ where: { id: gameId }, data: patch });
}

export { syncGameBookingState };

export async function recomputeGameBookingStatusForGame(gameId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await syncGameBookingState(tx, gameId);
  });
}

export async function patchGameBookings(
  gameId: string,
  userId: string,
  isAdmin: boolean,
  body: { add?: unknown; remove?: unknown },
) {
  const allowed = await canMutateGameBookings(gameId, userId, isAdmin);
  if (!allowed) {
    throw new ApiError(403, BOOKING_ERROR_KEYS.updateLinksForbidden);
  }

  const add = Array.isArray(body.add)
    ? Array.from(
        new Set(
          body.add
            .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
            .map((id) => id.trim()),
        ),
      )
    : [];
  const remove = Array.isArray(body.remove)
    ? Array.from(
        new Set(
          body.remove
            .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
            .map((id) => id.trim()),
        ),
      )
    : [];

  if (add.length === 0 && remove.length === 0) {
    throw new ApiError(400, BOOKING_ERROR_KEYS.patchRequiresBookingId);
  }

  await prisma.$transaction(async (tx) => {
    if (remove.length > 0) {
      await tx.gameExternalBooking.deleteMany({
        where: { gameId, externalBookingId: { in: remove } },
      });
    }

    if (add.length > 0) {
      const existing = await tx.gameExternalBooking.findMany({
        where: { gameId, externalBookingId: { in: add } },
        select: { externalBookingId: true },
      });
      if (existing.length > 0) {
        throw new ApiError(400, BOOKING_ERROR_KEYS.alreadyLinked);
      }

      await tx.gameExternalBooking.createMany({
        data: add.map((externalBookingId) => ({
          gameId,
          externalBookingId,
          externalBookingProvider: ClubIntegrationType.BOOKTIME,
        })),
      });
    }

    await syncGameBookingState(tx, gameId, { clearBookedCourtWhenUnlinked: true });
  });

  return prisma.gameExternalBooking.findMany({
    where: { gameId },
    select: gameExternalBookingSelect,
    orderBy: { createdAt: 'asc' },
  });
}

export async function putGameBookingSnapshots(
  gameId: string,
  userId: string,
  isAdmin: boolean,
  body: { snapshots?: unknown },
) {
  const allowed = await canMutateGameBookings(gameId, userId, isAdmin);
  if (!allowed) {
    throw new ApiError(403, BOOKING_ERROR_KEYS.updateSnapshotsForbidden);
  }

  const snapshots = parseBookingSnapshots({ bookingSnapshots: body.snapshots });
  if (snapshots.length === 0) {
    throw new ApiError(400, BOOKING_ERROR_KEYS.snapshotsRequired);
  }

  const timeZone = await resolveBooktimeTimezoneForGame(gameId);

  await prisma.$transaction(async (tx) => {
    const game = await tx.game.findUnique({
      where: { id: gameId },
      select: { timeOverride: true },
    });
    if (!game) throw new ApiError(404, 'Game not found');

    for (const snap of snapshots) {
      const updated = await tx.gameExternalBooking.updateMany({
        where: { gameId, externalBookingId: snap.externalBookingId },
        data: snapshotToRowData(snap, timeZone),
      });
      if (updated.count === 0) {
        throw new ApiError(404, BOOKING_ERROR_KEYS.bookingNotLinked, true, {
          externalBookingId: snap.externalBookingId,
        });
      }
    }

    if (!game.timeOverride) {
      const derived = await deriveGameTimesFromJoinRows(gameId, tx);
      if (derived) {
        await tx.game.update({
          where: { id: gameId },
          data: {
            startTime: derived.startTime,
            endTime: derived.endTime,
            timeIsSet: true,
          },
        });
      }
    }

    await syncGameBookingState(tx, gameId);
  });

  return prisma.gameExternalBooking.findMany({
    where: { gameId },
    select: gameExternalBookingSelect,
    orderBy: { createdAt: 'asc' },
  });
}

function linkGamePatchToUpdateData(
  patch: LinkBookingToGamePatch,
  timeZone: string,
): Prisma.GameUncheckedUpdateInput {
  const data: Prisma.GameUncheckedUpdateInput = {};
  if (patch.clubId !== undefined) data.clubId = patch.clubId;
  if (patch.courtId !== undefined) data.courtId = patch.courtId;
  if (patch.startTime !== undefined) {
    data.startTime =
      parseBooktimeStoredOrNaiveToDate(patch.startTime, timeZone) ?? new Date(patch.startTime);
  }
  if (patch.endTime !== undefined) {
    data.endTime =
      parseBooktimeStoredOrNaiveToDate(patch.endTime, timeZone) ?? new Date(patch.endTime);
  }
  if (patch.timeIsSet !== undefined) data.timeIsSet = patch.timeIsSet;
  if (patch.hasBookedCourt !== undefined) data.hasBookedCourt = patch.hasBookedCourt;
  return data;
}

export async function linkBookingToGame(
  gameId: string,
  userId: string,
  isAdmin: boolean,
  body: unknown,
) {
  const allowed = await canMutateGameBookings(gameId, userId, isAdmin);
  if (!allowed) {
    throw new ApiError(403, BOOKING_ERROR_KEYS.updateLinksForbidden);
  }

  const { externalBookingId, snapshot, gamePatch } = parseLinkBookingToGameBody(body);
  const timeZone = await resolveBooktimeTimezoneForGame(gameId);

  await prisma.$transaction(async (tx) => {
    const game = await tx.game.findUnique({
      where: { id: gameId },
      select: { id: true, timeOverride: true },
    });
    if (!game) throw new ApiError(404, 'Game not found');

    const existing = await tx.gameExternalBooking.findFirst({
      where: { gameId, externalBookingId },
      select: { id: true },
    });
    if (existing) {
      throw new ApiError(400, BOOKING_ERROR_KEYS.alreadyLinked);
    }

    if (gamePatch) {
      const patchData = linkGamePatchToUpdateData(gamePatch, timeZone);
      if (Object.keys(patchData).length > 0) {
        await tx.game.update({ where: { id: gameId }, data: patchData });
      }
    }

    await tx.gameExternalBooking.create({
      data: {
        gameId,
        externalBookingId,
        externalBookingProvider: ClubIntegrationType.BOOKTIME,
        ...snapshotToRowData(snapshot, timeZone),
      },
    });

    await syncGameBookingState(tx, gameId);
  });

  return prisma.gameExternalBooking.findMany({
    where: { gameId },
    select: gameExternalBookingSelect,
    orderBy: { createdAt: 'asc' },
  });
}
