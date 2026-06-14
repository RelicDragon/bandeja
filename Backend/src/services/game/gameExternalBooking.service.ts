import { ClubIntegrationType, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { BOOKING_ERROR_KEYS } from '@bandeja/shared/booking/errorKeys';
import { ApiError } from '../../utils/ApiError';
import { BOOKTIME_DEFAULT_TIMEZONE, booktimeIsoToUtcIso } from '../../shared/booktime/localTime';
import { deriveGameTimeFromBookings } from '../../shared/gameBooking/deriveGameTimeFromBookings';
import {
  LEGACY_EXTERNAL_BOOKING_ID_REJECTED,
  type BookingSnapshotInput,
} from '../../shared/gameBooking/contracts';
import { canMutateGameBookings } from '../../shared/gameBooking/bookingLinkAuthorization';

type Tx = Prisma.TransactionClient;

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

function snapshotMap(snapshots: BookingSnapshotInput[]): Map<string, BookingSnapshotInput> {
  const map = new Map<string, BookingSnapshotInput>();
  for (const snap of snapshots) {
    map.set(snap.externalBookingId, snap);
  }
  return map;
}

function parseBooktimeSnapshotInstant(iso: string | undefined): Date | null {
  if (!iso?.trim()) return null;
  const utcIso = booktimeIsoToUtcIso(iso, BOOKTIME_DEFAULT_TIMEZONE);
  const d = new Date(utcIso ?? iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function snapshotToRowData(
  snap: BookingSnapshotInput | undefined,
): Pick<Prisma.GameExternalBookingCreateManyInput, 'courtId' | 'bookingStart' | 'bookingEnd'> {
  return {
    courtId: snap?.courtId ?? null,
    bookingStart: parseBooktimeSnapshotInstant(snap?.bookingStart),
    bookingEnd: parseBooktimeSnapshotInstant(snap?.bookingEnd),
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
): Promise<void> {
  if (externalBookingIds.length === 0) return;
  const snaps = snapshotMap(snapshots);
  await tx.gameExternalBooking.createMany({
    data: externalBookingIds.map((externalBookingId) => ({
      gameId,
      externalBookingId,
      externalBookingProvider: provider,
      ...snapshotToRowData(snaps.get(externalBookingId)),
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

async function syncHasBookedCourtAndTimes(tx: Tx, gameId: string): Promise<void> {
  const linkCount = await tx.gameExternalBooking.count({ where: { gameId } });
  const game = await tx.game.findUnique({
    where: { id: gameId },
    select: { timeOverride: true },
  });
  if (!game) throw new ApiError(404, 'Game not found');

  const patch: Prisma.GameUpdateInput = {
    hasBookedCourt: linkCount > 0,
  };

  if (!game.timeOverride && linkCount > 0) {
    const derived = await deriveGameTimesFromJoinRows(gameId, tx);
    if (derived) {
      patch.startTime = derived.startTime;
      patch.endTime = derived.endTime;
      patch.timeIsSet = true;
    }
  }

  await tx.game.update({ where: { id: gameId }, data: patch });
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

    await syncHasBookedCourtAndTimes(tx, gameId);
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

  await prisma.$transaction(async (tx) => {
    const game = await tx.game.findUnique({
      where: { id: gameId },
      select: { timeOverride: true },
    });
    if (!game) throw new ApiError(404, 'Game not found');

    for (const snap of snapshots) {
      const updated = await tx.gameExternalBooking.updateMany({
        where: { gameId, externalBookingId: snap.externalBookingId },
        data: snapshotToRowData(snap),
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
  });

  return prisma.gameExternalBooking.findMany({
    where: { gameId },
    select: gameExternalBookingSelect,
    orderBy: { createdAt: 'asc' },
  });
}
