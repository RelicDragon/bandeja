import { weltnerBookingLinkData } from '../weltner/weltnerBookingLinks';
import {
  ClubIntegrationType,
  CourtBookingMode,
  EntityType,
  GameBookingStatus,
  GameExternalBookingUpstreamState,
  Prisma,
} from '@prisma/client';
import prisma from '../../config/database';
import { BOOKING_ERROR_KEYS } from '@bandeja/shared/booking/errorKeys';
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
import { assertCourtMatchesGameSport } from '../../shared/clubSports';
import { notifyGameBookingStatusChangeIfNeeded } from './notifyGameBookingStatusChange';
import { computeLegacyBookingFieldsFromSlots } from '../../shared/gameBooking/computeLegacyBookingFieldsFromSlots';
import {
  applyLegacyHasBookedCourt,
  ensurePrimaryCourtSlot,
  placeLinksOnSlots,
  pruneEmptySlotsAboveCap,
  type TimePolicy,
} from '../gameCourt/courtSlots.tx';
import {
  publishTrackedScheduleChange,
  trackScheduleChangeInTx,
  type RecordScheduleChangeResult,
} from '../gameTimeChange/gameTimeChange.service';

type Tx = Prisma.TransactionClient;

async function resolveGameClubBookingProvider(gameId: string, tx: Tx): Promise<ClubIntegrationType> {
  const game = await tx.game.findUnique({
    where: { id: gameId },
    select: {
      club: { select: { integrationType: true } },
      court: { select: { club: { select: { integrationType: true } } } },
    },
  });
  const integrationType =
    game?.club?.integrationType ?? game?.court?.club?.integrationType ?? null;
  if (
    integrationType === ClubIntegrationType.BOOKTIME ||
    integrationType === ClubIntegrationType.PADELOO ||
    integrationType === ClubIntegrationType.KLIKTEREN ||
    integrationType === ClubIntegrationType.WELTNER ||
    integrationType === ClubIntegrationType.NSPADELSUPABASE
  ) {
    return integrationType;
  }
  return ClubIntegrationType.BOOKTIME;
}

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
 * Booking status sync entry points (must all call syncGameBookingState; it also flips a
 * "Game only" game back to CLUB once it has a linked booking):
 * - POST /games (create) — create.service transaction
 * - PATCH /games/:id — update.service transaction (when patch affects status fields)
 * - PATCH /games/:id/bookings — patchGameBookings
 * - POST /games/:id/link-booking — linkBookingToGame
 * - PUT /games/:id/booking-snapshots — putGameBookingSnapshots
 * - scripts/fix-booktime-game-times — maintenance batch fix
 *
 * Every entry point here except the maintenance scripts runs inside
 * {@link runBookingLinkTransaction}: a link / unlink / snapshot refresh that
 * moves the game's time resets attendance and queues the "time changed" notice
 * exactly like a time edit (same transaction as the time write). The user who
 * linked or unlinked is the editor; a system recompute has none.
 * (`PATCH /games/:id` re-syncs inside `GameUpdateService`, which records the
 * change itself.)
 */

export async function runBookingLinkTransaction<T>(
  gameId: string,
  editorUserId: string | null,
  write: (tx: Tx) => Promise<T>,
): Promise<T> {
  let change: RecordScheduleChangeResult | null = null;
  const value = await prisma.$transaction(async (tx) => {
    const tracked = await trackScheduleChangeInTx(tx, { gameId, editorUserId }, () => write(tx));
    change = tracked.change;
    return tracked.value;
  });
  await publishTrackedScheduleChange(gameId, editorUserId, change);
  return value;
}

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
  const gameCourtId =
    typeof src.gameCourtId === 'string' && src.gameCourtId.trim() ? src.gameCourtId.trim() : undefined;
  return {
    externalBookingId,
    snapshot,
    gamePatch: parseLinkGamePatch(src.gamePatch),
    ...(gameCourtId ? { gameCourtId } : {}),
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

/**
 * Refresh of an existing link: only the fields the snapshot actually carries. A snapshot without
 * a court or times (partial provider row) must not turn a known booking into "unknown court /
 * unknown time" (which reads as a coverage gap).
 */
function snapshotToRowUpdate(
  snap: BookingSnapshotInput,
  timeZone: string,
): Partial<Pick<Prisma.GameExternalBookingUpdateManyMutationInput, 'bookingStart' | 'bookingEnd'>> & { courtId?: string } {
  const row = snapshotToRowData(snap, timeZone);
  return {
    ...(row.courtId ? { courtId: row.courtId } : {}),
    ...(row.bookingStart && row.bookingEnd ? { bookingStart: row.bookingStart, bookingEnd: row.bookingEnd } : {}),
  };
}

/** Link fields for "the provider agrees with this link" (drift cleared). */
export const UPSTREAM_IN_SYNC = {
  upstreamState: GameExternalBookingUpstreamState.OK,
  upstreamStart: null,
  upstreamEnd: null,
} as const;

export function serializeLinkedBooking(row: {
  id: string;
  externalBookingId: string;
  externalBookingProvider: ClubIntegrationType;
  courtId: string | null;
  bookingStart: Date | null;
  bookingEnd: Date | null;
  gameCourtId?: string | null;
  upstreamState?: GameExternalBookingUpstreamState;
  upstreamStart?: Date | null;
  upstreamEnd?: Date | null;
  upstreamCheckedAt?: Date | null;
}) {
  return {
    id: row.id,
    externalBookingId: row.externalBookingId,
    externalBookingProvider: row.externalBookingProvider,
    ...(row.courtId ? { courtId: row.courtId } : {}),
    ...(row.gameCourtId ? { gameCourtId: row.gameCourtId } : {}),
    ...(row.bookingStart ? { bookingStart: row.bookingStart.toISOString() } : {}),
    ...(row.bookingEnd ? { bookingEnd: row.bookingEnd.toISOString() } : {}),
    // Club-side drift (additive): what the provider says now; OK when it matches.
    ...(row.upstreamState ? { upstreamState: row.upstreamState } : {}),
    ...(row.upstreamStart ? { upstreamStart: row.upstreamStart.toISOString() } : {}),
    ...(row.upstreamEnd ? { upstreamEnd: row.upstreamEnd.toISOString() } : {}),
    ...(row.upstreamCheckedAt ? { upstreamCheckedAt: row.upstreamCheckedAt.toISOString() } : {}),
  };
}

export const gameExternalBookingSelect = {
  id: true,
  externalBookingId: true,
  externalBookingProvider: true,
  courtId: true,
  bookingStart: true,
  bookingEnd: true,
  gameCourtId: true,
  upstreamState: true,
  upstreamStart: true,
  upstreamEnd: true,
  upstreamCheckedAt: true,
} as const;

export const gameExternalBookingInclude = {
  orderBy: { createdAt: 'asc' as const },
  select: gameExternalBookingSelect,
};

/**
 * `bookedByUserId` for rows about to be attached by `userId`. A booking already known on another
 * game keeps that row's booker (null stays null), so a co-admin re-linking a booking never becomes
 * its booker. Only a booking new to the app is attributed to the acting user.
 */
export async function resolveBookedByUserIds(
  tx: Tx,
  externalBookingIds: string[],
  userId: string | undefined,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (externalBookingIds.length === 0) return out;
  const known = await tx.gameExternalBooking.findMany({
    where: { externalBookingId: { in: externalBookingIds } },
    orderBy: { createdAt: 'asc' },
    select: { externalBookingId: true, bookedByUserId: true },
  });
  for (const row of known) {
    const prev = out.get(row.externalBookingId);
    if (prev === undefined || (prev === null && row.bookedByUserId)) {
      out.set(row.externalBookingId, row.bookedByUserId);
    }
  }
  for (const id of externalBookingIds) {
    if (!out.has(id)) out.set(id, userId ?? null);
  }
  return out;
}

export async function insertJoinRows(
  tx: Tx,
  gameId: string,
  externalBookingIds: string[],
  provider: ClubIntegrationType,
  snapshots: BookingSnapshotInput[],
  timeZone: string,
  userId?: string,
): Promise<void> {
  if (externalBookingIds.length === 0) return;
  const resolvedProvider = await resolveGameClubBookingProvider(gameId, tx);
  if (resolvedProvider === ClubIntegrationType.WELTNER) provider = resolvedProvider;
  const snaps = snapshotMap(snapshots);
  const bookedBy = await resolveBookedByUserIds(tx, externalBookingIds, userId);
  await tx.gameExternalBooking.createMany({
    data: await Promise.all(externalBookingIds.map(async (externalBookingId) => ({
      gameId,
      externalBookingId,
      bookedByUserId: bookedBy.get(externalBookingId) ?? null,
      externalBookingProvider: externalBookingId.startsWith('weltner:') ? ClubIntegrationType.WELTNER : provider,
      ...(provider === 'WELTNER' || externalBookingId.startsWith('weltner:')
        ? await weltnerBookingLinkData(tx, { gameId, userId, externalBookingId })
        : snapshotToRowData(snaps.get(externalBookingId), timeZone)),
    }))),
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

export type SyncGameBookingStateOptions = {
  /** PATCH /bookings: all links gone means "not booked" unless a slot is still REPORTED. */
  clearBookedCourtWhenUnlinked?: boolean;
  /** Old-app `hasBookedCourt` written in this request (PATCH / create / link gamePatch). */
  legacyHasBookedCourt?: boolean;
  /** Court slots were written explicitly (PUT court-slots): never infer reports from `hasBookedCourt`. */
  slotsAuthoritative?: boolean;
  /** `?timePolicy=explicit`: never derive/move the game's time from bookings. */
  timePolicy?: TimePolicy;
  /** Who caused this sync (stamped as `reportedById` when a legacy report is converted). */
  actorUserId?: string | null;
};

async function syncGameBookingState(
  tx: Tx,
  gameId: string,
  options?: SyncGameBookingStateOptions,
): Promise<{ previousBookingStatus: GameBookingStatus; bookingStatus: GameBookingStatus }> {
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
      bookingStatus: true,
      entityType: true,
      courtBookingMode: true,
    },
  });
  if (!game) throw new ApiError(404, 'Game not found');

  const previousBookingStatus = game.bookingStatus;
  const patch: Prisma.GameUncheckedUpdateInput = {};

  const linkCount = await tx.gameExternalBooking.count({ where: { gameId } });
  // Links win: every link write funnels through here, so a "Game only" game that gains a
  // linked booking is a club booking again, in the same transaction.
  if (linkCount > 0 && game.courtBookingMode === CourtBookingMode.GAME_ONLY) {
    patch.courtBookingMode = CourtBookingMode.CLUB;
  }

  let courtId = game.courtId;
  if (!courtId && linkCount > 0) {
    const bookingWithCourt = await tx.gameExternalBooking.findFirst({
      where: { gameId, courtId: { not: null } },
      orderBy: { createdAt: 'asc' },
      select: { courtId: true },
    });
    if (bookingWithCourt?.courtId) {
      courtId = bookingWithCourt.courtId;
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

  if (game.entityType !== EntityType.EVENT) {
    await ensurePrimaryCourtSlot(tx, gameId, courtId);
    await placeLinksOnSlots(tx, gameId, { appendMissing: false });

    if (options?.legacyHasBookedCourt === false) {
      if (linkCount === 0) {
        await applyLegacyHasBookedCourt(tx, gameId, false, options.actorUserId ?? null);
      }
    } else if (
      options?.legacyHasBookedCourt === true ||
      (game.hasBookedCourt && !options?.slotsAuthoritative && !options?.clearBookedCourtWhenUnlinked)
    ) {
      await applyLegacyHasBookedCourt(tx, gameId, true, options?.actorUserId ?? null);
    }
  }

  const slots = await tx.gameCourt.findMany({
    where: { gameId },
    orderBy: { order: 'asc' },
    select: { id: true, courtId: true, reservation: true, order: true },
  });
  const links = await tx.gameExternalBooking.findMany({
    where: { gameId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      externalBookingId: true,
      externalBookingProvider: true,
      gameCourtId: true,
      courtId: true,
      bookingStart: true,
      bookingEnd: true,
    },
  });
  const counts = await tx.game.findUnique({ where: { id: gameId }, select: { reportedAnyCourtCount: true, courtSlotCount: true } });

  const timePolicyExplicit = options?.timePolicy === 'explicit';
  let window = { startTime: game.startTime, endTime: game.endTime, timeIsSet: game.timeIsSet };
  if (!game.timeOverride && !timePolicyExplicit && links.length > 0) {
    const derived = await deriveGameTimesFromJoinRows(gameId, tx);
    if (derived) {
      patch.startTime = derived.startTime;
      patch.endTime = derived.endTime;
      patch.timeIsSet = true;
      window = { ...derived, timeIsSet: true };
    }
  }

  const computed = computeLegacyBookingFieldsFromSlots({
    slots,
    links,
    reportedAnyCourtCount: counts?.reportedAnyCourtCount ?? 0,
    courtSlotCount: counts?.courtSlotCount ?? null,
    startTime: window.startTime,
    endTime: window.endTime,
    timeIsSet: window.timeIsSet,
    maxParticipants: game.maxParticipants,
    playersPerMatch: game.playersPerMatch,
  });
  const bookingStatus = computed.bookingStatus as GameBookingStatus;
  patch.bookingStatus = bookingStatus;
  patch.hasBookedCourt = computed.hasBookedCourt;

  await tx.game.update({ where: { id: gameId }, data: patch });
  // `Game.courtId` follows the first slot, also after a link patch named another court. Only a
  // set-but-wrong primary is corrected: a court just cleared (club change) is never refilled
  // from a slot of the old club before that slot is removed.
  if (game.entityType !== EntityType.EVENT) await correctPrimaryCourtFromSlots(tx, gameId);

  return { previousBookingStatus, bookingStatus };
}

async function correctPrimaryCourtFromSlots(tx: Tx, gameId: string): Promise<void> {
  const [current, first] = await Promise.all([
    tx.game.findUnique({ where: { id: gameId }, select: { courtId: true, clubId: true } }),
    tx.gameCourt.findFirst({
      where: { gameId },
      orderBy: { order: 'asc' },
      select: { courtId: true, court: { select: { clubId: true } } },
    }),
  ]);
  if (!current?.courtId || !first || first.courtId === current.courtId) return;
  if (current.clubId && first.court.clubId !== current.clubId) return;
  await tx.game.update({ where: { id: gameId }, data: { courtId: first.courtId } });
}

export { syncGameBookingState };

/**
 * System recompute (court set changed, backfills): no editor, so a real move resets every answer.
 * Posts the booking-status chat notice when the status changed (pass `notify: false` to skip,
 * e.g. right after create).
 */
export async function recomputeGameBookingStatusForGame(
  gameId: string,
  editorUserId: string | null = null,
  options: { notify?: boolean } = {},
): Promise<void> {
  let previousBookingStatus: GameBookingStatus | null = null;
  await runBookingLinkTransaction(gameId, editorUserId, async (tx) => {
    const synced = await syncGameBookingState(tx, gameId);
    previousBookingStatus = synced.previousBookingStatus;
  });
  if (options.notify !== false) {
    await notifyGameBookingStatusChangeIfNeeded(gameId, previousBookingStatus);
  }
}

export async function patchGameBookings(
  gameId: string,
  userId: string,
  isAdmin: boolean,
  body: { add?: unknown; remove?: unknown },
  options: { timePolicy?: TimePolicy } = {},
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

  let previousBookingStatus: GameBookingStatus | null = null;

  await runBookingLinkTransaction(gameId, userId, async (tx) => {
    const provider = await resolveGameClubBookingProvider(gameId, tx);

    if (remove.length > 0) {
      await tx.gameExternalBooking.deleteMany({
        where: { gameId, externalBookingId: { in: remove } },
      });
      // The court a removed link added must not stay behind as an empty extra court.
      await pruneEmptySlotsAboveCap(tx, gameId);
    }

    if (add.length > 0) {
      const existing = await tx.gameExternalBooking.findMany({
        where: { gameId, externalBookingId: { in: add } },
        select: { externalBookingId: true },
      });
      if (existing.length > 0) {
        throw new ApiError(400, BOOKING_ERROR_KEYS.alreadyLinked);
      }

      await insertJoinRows(tx, gameId, add, provider, [], await resolveBooktimeTimezoneForGame(gameId), userId);
    }

    const synced = await syncGameBookingState(tx, gameId, {
      clearBookedCourtWhenUnlinked: true,
      timePolicy: options.timePolicy,
      actorUserId: userId,
    });
    previousBookingStatus = synced.previousBookingStatus;
  });

  await notifyGameBookingStatusChangeIfNeeded(gameId, previousBookingStatus);

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
  options: { timePolicy?: TimePolicy } = {},
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
  let previousBookingStatus: GameBookingStatus | null = null;

  await runBookingLinkTransaction(gameId, userId, async (tx) => {
    const game = await tx.game.findUnique({
      where: { id: gameId },
      select: { timeOverride: true },
    });
    if (!game) throw new ApiError(404, 'Game not found');

    const updatedLinks = await tx.gameExternalBooking.findMany({
      where: { gameId, externalBookingId: { in: snapshots.map((snap) => snap.externalBookingId) } },
      select: { id: true },
    });
    for (const snap of snapshots) {
      const updated = await tx.gameExternalBooking.updateMany({
        where: { gameId, externalBookingId: snap.externalBookingId },
        data: {
          ...(snap.externalBookingId.startsWith('weltner:')
            ? await weltnerBookingLinkData(tx, { gameId, externalBookingId: snap.externalBookingId })
            : snapshotToRowUpdate(snap, timeZone)),
          // The app just read the provider: any club-side drift is resolved.
          ...UPSTREAM_IN_SYNC,
          upstreamCheckedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        throw new ApiError(404, BOOKING_ERROR_KEYS.bookingNotLinked, true, {
          externalBookingId: snap.externalBookingId,
        });
      }
    }

    if (!game.timeOverride && options.timePolicy !== 'explicit') {
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

    // A refreshed snapshot may name another court: re-place, adding a slot for a new court.
    await placeLinksOnSlots(tx, gameId, {
      appendMissing: true,
      onlyLinkIds: updatedLinks.map((row) => row.id),
    });
    // A booking the club moved to another court leaves its old court empty.
    await pruneEmptySlotsAboveCap(tx, gameId);

    const synced = await syncGameBookingState(tx, gameId, {
      timePolicy: options.timePolicy,
      actorUserId: userId,
    });
    previousBookingStatus = synced.previousBookingStatus;
  });

  await notifyGameBookingStatusChangeIfNeeded(gameId, previousBookingStatus);

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

/**
 * Court slots: put a freshly linked booking on a slot. An explicit `gameCourtId`
 * must belong to the game and match the booking's court (when known); otherwise
 * the slot of the booking's court is used, appending one if the game lacks it.
 */
export async function placeNewLink(
  tx: Tx,
  gameId: string,
  link: { id: string; courtId: string | null },
  gameCourtId: string | undefined,
): Promise<void> {
  const game = await tx.game.findUnique({ where: { id: gameId }, select: { courtId: true } });
  await ensurePrimaryCourtSlot(tx, gameId, game?.courtId ?? null);
  if (gameCourtId) {
    const slot = await tx.gameCourt.findFirst({
      where: { id: gameCourtId, gameId },
      select: { id: true, courtId: true },
    });
    if (!slot) throw new ApiError(400, 'gameCourtId does not belong to this game');
    if (link.courtId && link.courtId !== slot.courtId) {
      throw new ApiError(400, "gameCourtId court does not match the booking's court");
    }
    await tx.gameExternalBooking.update({ where: { id: link.id }, data: { gameCourtId: slot.id } });
    return;
  }
  await placeLinksOnSlots(tx, gameId, { appendMissing: true, onlyLinkIds: [link.id] });
}

/**
 * Inserts one link (provider resolved from the club, Weltner receipts validated, booker
 * stamped) and places it on a slot. No status sync — the caller syncs once afterwards.
 */
export async function createLinkInTx(
  tx: Tx,
  gameId: string,
  userId: string,
  input: { externalBookingId: string; snapshot: BookingSnapshotInput; gameCourtId?: string },
  timeZone: string,
): Promise<{ id: string; courtId: string | null }> {
  const { externalBookingId } = input;
  const provider = await resolveGameClubBookingProvider(gameId, tx);
  const bookedBy = await resolveBookedByUserIds(tx, [externalBookingId], userId);
  const link = await tx.gameExternalBooking.create({
    select: { id: true, courtId: true },
    data: {
      gameId,
      externalBookingId,
      bookedByUserId: bookedBy.get(externalBookingId) ?? null,
      externalBookingProvider: externalBookingId.startsWith('weltner:') ? ClubIntegrationType.WELTNER : provider,
      ...(provider === 'WELTNER' || externalBookingId.startsWith('weltner:')
        ? await weltnerBookingLinkData(tx, { gameId, userId, externalBookingId })
        : snapshotToRowData(input.snapshot, timeZone)),
    },
  });
  await placeNewLink(tx, gameId, link, input.gameCourtId);
  return link;
}

export async function linkBookingToGame(
  gameId: string,
  userId: string,
  isAdmin: boolean,
  body: unknown,
  options: { timePolicy?: TimePolicy } = {},
) {
  const allowed = await canMutateGameBookings(gameId, userId, isAdmin);
  if (!allowed) {
    throw new ApiError(403, BOOKING_ERROR_KEYS.updateLinksForbidden);
  }

  const { externalBookingId, snapshot, gamePatch, gameCourtId } = parseLinkBookingToGameBody(body);
  const timeZone = await resolveBooktimeTimezoneForGame(gameId);
  let previousBookingStatus: GameBookingStatus | null = null;
  const resolvedSnapshot = { ...snapshot };
  if (!resolvedSnapshot.courtId && gamePatch?.courtId) {
    resolvedSnapshot.courtId = gamePatch.courtId;
  }

  await runBookingLinkTransaction(gameId, userId, async (tx) => {
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

    const current = await tx.game.findUniqueOrThrow({
      where: { id: gameId },
      select: { clubId: true, sport: true, startTime: true, endTime: true, timeIsSet: true },
    });
    // Old apps (no explicit time policy): bookings drive the game's time from the earliest start
    // to the latest end. A booking apart from the game (e.g. another day) would stretch the game
    // over both; one that overlaps or touches its window (back-to-back hours) is fine.
    if (options.timePolicy !== 'explicit' && !game.timeOverride && current.timeIsSet) {
      const linkCount = await tx.gameExternalBooking.count({ where: { gameId } });
      const { bookingStart, bookingEnd } = ingestBookingSnapshotTimes(
        resolvedSnapshot.bookingStart,
        resolvedSnapshot.bookingEnd,
        timeZone,
      );
      if (
        linkCount > 0 &&
        bookingStart &&
        bookingEnd &&
        (bookingEnd.getTime() < current.startTime.getTime() || bookingStart.getTime() > current.endTime.getTime())
      ) {
        throw new ApiError(400, "This booking does not overlap the game's time");
      }
    }
    const finalClubId = gamePatch?.clubId !== undefined ? gamePatch.clubId : current.clubId;
    if (gamePatch) {
      const patchData = linkGamePatchToUpdateData(gamePatch, timeZone);
      if (gamePatch.clubId !== undefined && gamePatch.clubId !== current.clubId) {
        // Same rule as clearing the club: bookings at the old club are released first.
        if (current.clubId && (await tx.gameExternalBooking.count({ where: { gameId } })) > 0) {
          throw new ApiError(400, BOOKING_ERROR_KEYS.removeBookingsBeforeClearing);
        }
        const club = gamePatch.clubId
          ? await tx.club.findUnique({ where: { id: gamePatch.clubId }, select: { cityId: true } })
          : null;
        if (gamePatch.clubId && !club) throw new ApiError(404, 'Club not found');
        if (club) patchData.cityId = club.cityId;
        // Planned courts of the old club go with it (none has a booking: checked above).
        await tx.gameCourt.deleteMany({
          where: { gameId, ...(gamePatch.clubId ? { court: { clubId: { not: gamePatch.clubId } } } : {}) },
        });
      }
      if (Object.keys(patchData).length > 0) {
        await tx.game.update({ where: { id: gameId }, data: patchData });
      }
    }
    // The booking's court and the patched primary court must be courts of the game's club.
    for (const courtId of new Set([resolvedSnapshot.courtId, gamePatch?.courtId].filter((id): id is string => Boolean(id)))) {
      const court = await tx.court.findUnique({ where: { id: courtId }, select: { clubId: true, sport: true } });
      if (!court) throw new ApiError(404, 'Court not found');
      if (finalClubId && court.clubId !== finalClubId) throw new ApiError(400, "Courts must belong to the game's club");
      assertCourtMatchesGameSport(court.sport, current.sport);
    }

    await createLinkInTx(tx, gameId, userId, { externalBookingId, snapshot: resolvedSnapshot, gameCourtId }, timeZone);

    const synced = await syncGameBookingState(tx, gameId, {
      timePolicy: options.timePolicy,
      actorUserId: userId,
    });
    previousBookingStatus = synced.previousBookingStatus;
  });

  await notifyGameBookingStatusChangeIfNeeded(gameId, previousBookingStatus);

  return prisma.gameExternalBooking.findMany({
    where: { gameId },
    select: gameExternalBookingSelect,
    orderBy: { createdAt: 'asc' },
  });
}
