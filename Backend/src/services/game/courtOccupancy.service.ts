import { ClubIntegrationType, CourtSlotHoldLabel, Prisma } from '@prisma/client';
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
}

export type OccupancyBlockKind = 'game' | 'hold' | 'external';

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
  gameCourtFilter: 'player' | 'admin',
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
    if (gameCourtFilter === 'admin') {
      andConditions.push({
        OR: [
          { courtId },
          { courtId: null },
          { gameCourts: { some: { courtId } } },
        ],
      });
    } else {
      andConditions.push({
        OR: [{ courtId }, { courtId: null }],
      });
    }
  }

  return { AND: andConditions };
}

async function queryGameBlocks(
  clubId: string,
  rangeStart: Date,
  rangeEnd: Date,
  courtId: string | undefined,
  gameCourtFilter: 'player' | 'admin',
  applyDateRange: boolean
): Promise<OccupancyBlock[]> {
  const games = await prisma.game.findMany({
    where: buildGameWhere(clubId, rangeStart, rangeEnd, courtId, gameCourtFilter, applyDateRange),
    include: {
      court: {
        select: {
          id: true,
          name: true,
          integrationCourtName: true,
        },
      },
    },
    orderBy: { startTime: 'asc' },
  });

  return games.map((game) => ({
    kind: 'game' as const,
    gameId: game.id,
    courtId: game.court?.id ?? null,
    courtName: game.court?.name ?? null,
    integrationCourtName: game.court?.integrationCourtName ?? null,
    startTime: game.startTime.toISOString(),
    endTime: game.endTime.toISOString(),
    hasBookedCourt: game.hasBookedCourt,
    clubBooked: false,
    isFree: false,
  }));
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

export function isOccupancySoftBlock(block: OccupancyBlock): boolean {
  return block.kind === 'game' && !block.hasBookedCourt;
}

export class CourtOccupancyService {
  static async getOccupancy(options: CourtOccupancyOptions): Promise<CourtOccupancyResult> {
    const {
      clubId,
      rangeStart,
      rangeEnd,
      courtId,
      includeUnmapped = false,
      gameCourtFilter = 'player',
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
            gameCourtFilter,
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
