import { ClubIntegrationType, CourtSlotHoldLabel, GameCourtReservation, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { loadMergedBusySlots } from '../../shared/booktimeBusySnapshot';
import { UNASSIGNED_COURT_KEY } from '../../shared/clubScheduleConstants';
import type { ScheduleSlot } from '../clubAdmin/clubAdmin.types';

export interface BookedCourtSlot {
  courtId: string | null;
  courtName: string | null;
  integrationCourtName: string | null;
  startTime: string;
  endTime: string;
  hasBookedCourt: boolean;
  clubBooked: boolean;
  isFree: boolean;
  slotKind?: 'game' | 'external' | 'hold';
  holdBlocked?: boolean;
  /** Additive (court slots): the app game this block belongs to. */
  gameId?: string;
  /** Additive (court slots): per-slot reservation of an app game block. */
  reservation?: OccupancyReservation;
}

export type OccupancyBlockKind = 'game' | 'hold' | 'external';

/**
 * Per court slot of an app game: `reserved` when the slot is REPORTED or carries a linked
 * booking, `planned` otherwise. `hasBookedCourt` on the same block keeps its old, game-level
 * meaning for shipped apps.
 */
export type OccupancyReservation = 'planned' | 'reserved';

export interface OccupancyBlock {
  kind: OccupancyBlockKind;
  courtId: string | null;
  courtName: string | null;
  integrationCourtName: string | null;
  startTime: string;
  endTime: string;
  hasBookedCourt: boolean;
  clubBooked: boolean;
  isFree: boolean;
  holdBlocked?: boolean;
  gameId?: string;
  holdId?: string;
  holdLabel?: CourtSlotHoldLabel;
  holdNote?: string | null;
  /** Game blocks only: this slot's reservation (see {@link OccupancyReservation}). */
  reservation?: OccupancyReservation;
  /** Game blocks only: the `GameCourt` row this block stands for (absent for slot-less games). */
  gameCourtId?: string;
}

export interface CourtOccupancyResult {
  blocks: OccupancyBlock[];
  isLoadingExternalSlots: boolean;
}

export type CourtOccupancySources = {
  games?: boolean;
  holds?: boolean;
  externals?: boolean;
};

export type CourtOccupancyOptions = {
  clubId: string;
  rangeStart: Date;
  rangeEnd: Date;
  courtId?: string;
  includeUnmapped?: boolean;
  /** Kept for callers; both views now include every `GameCourt` of a game. */
  gameCourtFilter?: 'player' | 'admin';
  sources?: CourtOccupancySources;
  applyDateRange?: boolean;
};

const ACTIVE_GAME_STATUSES = ['ANNOUNCED', 'STARTED'] as const;

function buildGameWhere(
  clubId: string,
  rangeStart: Date,
  rangeEnd: Date,
  courtId: string | undefined,
  applyDateRange: boolean
): Prisma.GameWhereInput {
  const andConditions: Prisma.GameWhereInput[] = [
    { timeIsSet: true },
    { status: { in: [...ACTIVE_GAME_STATUSES] } },
    {
      OR: [{ clubId }, { court: { clubId } }],
    },
  ];

  if (applyDateRange) {
    andConditions.push(
      { endTime: { gte: rangeStart } },
      { startTime: { lte: rangeEnd } }
    );
  }

  if (courtId) {
    // Player and admin views both include every court slot of a game (`GameCourt`).
    andConditions.push({
      OR: [
        { courtId },
        { courtId: null },
        { gameCourts: { some: { courtId } } },
      ],
    });
  }

  return { AND: andConditions };
}

type GameBlockRow = {
  id: string;
  startTime: Date;
  endTime: Date;
  hasBookedCourt: boolean;
  reportedAnyCourtCount: number;
  court: { id: string; name: string; integrationCourtName: string | null } | null;
  gameCourts: Array<{
    id: string;
    courtId: string;
    order: number;
    reservation: GameCourtReservation;
    court: { id: string; name: string; integrationCourtName: string | null };
  }>;
  externalBookings: Array<{ gameCourtId: string | null; courtId: string | null }>;
};

/**
 * One block per court slot of the game (every `GameCourt`), so a two-court game occupies both
 * courts. A slot is `reserved` when it is REPORTED or a linked booking sits on it (by
 * `gameCourtId`, or by court for a not-yet-placed link). A game without slots keeps its one
 * `Game.court` block (or a court-less one), reserved when anything is reserved.
 */
export function gameRowToOccupancyBlocks(game: GameBlockRow, courtId?: string): OccupancyBlock[] {
  const base = {
    kind: 'game' as const,
    gameId: game.id,
    startTime: game.startTime.toISOString(),
    endTime: game.endTime.toISOString(),
    hasBookedCourt: game.hasBookedCourt,
    clubBooked: false,
    isFree: false,
  };
  if (game.gameCourts.length === 0) {
    if (courtId && game.court && game.court.id !== courtId) return [];
    const reserved = game.externalBookings.length > 0 || game.reportedAnyCourtCount > 0 || game.hasBookedCourt;
    return [
      {
        ...base,
        courtId: game.court?.id ?? null,
        courtName: game.court?.name ?? null,
        integrationCourtName: game.court?.integrationCourtName ?? null,
        reservation: reserved ? 'reserved' : 'planned',
      },
    ];
  }
  const slotIds = new Set(game.gameCourts.map((slot) => slot.id));
  return [...game.gameCourts]
    .sort((a, b) => a.order - b.order)
    .filter((slot) => !courtId || slot.courtId === courtId)
    .map((slot) => {
      const linked = game.externalBookings.some(
        (link) =>
          link.gameCourtId === slot.id ||
          ((!link.gameCourtId || !slotIds.has(link.gameCourtId)) && link.courtId === slot.courtId),
      );
      const reserved = linked || slot.reservation === GameCourtReservation.REPORTED;
      return {
        ...base,
        courtId: slot.court.id,
        courtName: slot.court.name,
        integrationCourtName: slot.court.integrationCourtName,
        reservation: reserved ? ('reserved' as const) : ('planned' as const),
        gameCourtId: slot.id,
      };
    });
}

async function queryGameBlocks(
  clubId: string,
  rangeStart: Date,
  rangeEnd: Date,
  courtId: string | undefined,
  applyDateRange: boolean
): Promise<OccupancyBlock[]> {
  const courtSelect = { id: true, name: true, integrationCourtName: true } as const;
  const games = await prisma.game.findMany({
    where: buildGameWhere(clubId, rangeStart, rangeEnd, courtId, applyDateRange),
    select: {
      id: true,
      startTime: true,
      endTime: true,
      hasBookedCourt: true,
      reportedAnyCourtCount: true,
      court: { select: courtSelect },
      gameCourts: {
        select: { id: true, courtId: true, order: true, reservation: true, court: { select: courtSelect } },
      },
      externalBookings: { select: { gameCourtId: true, courtId: true } },
    },
    orderBy: { startTime: 'asc' },
  });

  return games.flatMap((game) => gameRowToOccupancyBlocks(game, courtId));
}

async function queryHoldBlocks(
  clubId: string,
  rangeStart: Date,
  rangeEnd: Date,
  courtId: string | undefined,
  applyDateRange: boolean
): Promise<OccupancyBlock[]> {
  const holds = await prisma.courtSlotHold.findMany({
    where: {
      clubId,
      deletedAt: null,
      ...(courtId ? { courtId } : {}),
      ...(applyDateRange
        ? {
            endTime: { gte: rangeStart },
            startTime: { lte: rangeEnd },
          }
        : {}),
    },
    include: {
      court: {
        select: { id: true, name: true, integrationCourtName: true },
      },
    },
  });

  return holds.map((hold) => ({
    kind: 'hold' as const,
    holdId: hold.id,
    holdLabel: hold.label,
    holdNote: hold.note,
    courtId: hold.court.id,
    courtName: hold.court.name,
    integrationCourtName: hold.court.integrationCourtName,
    startTime: hold.startTime.toISOString(),
    endTime: hold.endTime.toISOString(),
    hasBookedCourt: true,
    clubBooked: true,
    isFree: false,
    holdBlocked: true,
  }));
}

async function queryExternalBlocks(
  clubId: string,
  rangeStart: Date,
  rangeEnd: Date,
  courtId: string | undefined,
  includeUnmapped: boolean
): Promise<{ blocks: OccupancyBlock[]; isLoadingExternalSlots: boolean }> {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { integrationType: true },
  });

  if (
    club?.integrationType !== ClubIntegrationType.BOOKTIME &&
    club?.integrationType !== ClubIntegrationType.PADELOO &&
    club?.integrationType !== ClubIntegrationType.KLIKTEREN
  ) {
    return { blocks: [], isLoadingExternalSlots: false };
  }

  try {
    const { slots: busySlots, isLoading } = await loadMergedBusySlots({
      clubId,
      rangeStart,
      rangeEnd,
      filterCourtId: courtId,
      includeUnmapped,
      integrationType: club.integrationType,
    });

    const blocks: OccupancyBlock[] = busySlots.map((slot) => ({
      kind: 'external' as const,
      courtId: slot.courtId,
      courtName: slot.courtName,
      integrationCourtName: slot.integrationCourtName,
      startTime: slot.startTime,
      endTime: slot.endTime,
      hasBookedCourt: true,
      clubBooked: true,
      isFree: false,
    }));

    return { blocks, isLoadingExternalSlots: isLoading };
  } catch (error) {
    console.error(`Error loading club booking snapshot for club ${clubId}:`, error);
    return { blocks: [], isLoadingExternalSlots: false };
  }
}

export function mapOccupancyBlockToBookedCourtSlot(block: OccupancyBlock): BookedCourtSlot {
  return {
    courtId: block.courtId,
    courtName: block.courtName,
    integrationCourtName: block.integrationCourtName,
    startTime: block.startTime,
    endTime: block.endTime,
    hasBookedCourt: block.hasBookedCourt,
    clubBooked: block.clubBooked,
    isFree: block.isFree,
    slotKind: block.kind,
    holdBlocked: block.holdBlocked,
    ...(block.gameId ? { gameId: block.gameId } : {}),
    ...(block.reservation ? { reservation: block.reservation } : {}),
  };
}

export function mapExternalBlockToScheduleSlot(block: OccupancyBlock): ScheduleSlot | null {
  if (block.kind !== 'external' || block.courtId == null) return null;
  return {
    type: 'external',
    courtId: block.courtId === UNASSIGNED_COURT_KEY ? UNASSIGNED_COURT_KEY : block.courtId,
    courtName: block.courtName,
    startTime: block.startTime,
    endTime: block.endTime,
  };
}

export function mapHoldBlockToScheduleSlot(block: OccupancyBlock): ScheduleSlot | null {
  if (block.kind !== 'hold' || !block.holdId || !block.courtId) return null;
  return {
    type: 'hold',
    holdId: block.holdId,
    courtId: block.courtId,
    label: block.holdLabel ?? 'WALK_IN',
    note: block.holdNote ?? null,
    startTime: block.startTime,
    endTime: block.endTime,
  };
}

export function isOccupancyHardBlock(block: OccupancyBlock): boolean {
  return block.clubBooked || block.holdBlocked === true;
}

/** An app game whose slot on this court is not reserved (per slot; falls back to `hasBookedCourt`). */
export function isOccupancySoftBlock(block: OccupancyBlock): boolean {
  if (block.kind !== 'game') return false;
  return block.reservation ? block.reservation === 'planned' : !block.hasBookedCourt;
}

/** An app game whose slot on this court is reserved (REPORTED or linked). */
export function isOccupancyReservedGameBlock(block: OccupancyBlock): boolean {
  if (block.kind !== 'game') return false;
  return block.reservation ? block.reservation === 'reserved' : block.hasBookedCourt;
}

export class CourtOccupancyService {
  static async getOccupancy(options: CourtOccupancyOptions): Promise<CourtOccupancyResult> {
    const {
      clubId,
      rangeStart,
      rangeEnd,
      courtId,
      includeUnmapped = false,
      sources = {},
      applyDateRange = true,
    } = options;

    const includeGames = sources.games !== false;
    const includeHolds = sources.holds !== false;
    const includeExternals = sources.externals !== false;

    const [gameBlocks, holdBlocks, externalResult] = await Promise.all([
      includeGames
        ? queryGameBlocks(
            clubId,
            rangeStart,
            rangeEnd,
            courtId,
            applyDateRange
          )
        : Promise.resolve([]),
      includeHolds
        ? queryHoldBlocks(clubId, rangeStart, rangeEnd, courtId, applyDateRange)
        : Promise.resolve([]),
      includeExternals
        ? queryExternalBlocks(clubId, rangeStart, rangeEnd, courtId, includeUnmapped)
        : Promise.resolve({ blocks: [], isLoadingExternalSlots: false }),
    ]);

    return {
      blocks: [...gameBlocks, ...holdBlocks, ...externalResult.blocks],
      isLoadingExternalSlots: externalResult.isLoadingExternalSlots,
    };
  }
}
