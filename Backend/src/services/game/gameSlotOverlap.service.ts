import { EntityType, GameStatus, ParticipantStatus, Prisma } from '@prisma/client';
import {
  occupancyBlocksSlot,
  SLOT_BUSY_PARTICIPANT_STATUSES,
  SLOT_OVERLAP_ENTITY_TYPES,
  SLOT_OVERLAP_GAME_STATUSES,
  userIdsBusyInSlot,
  type SlotOccupancy,
  type SlotTarget,
} from '@bandeja/shared/gameSlotOverlap';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';

export type SlotOverlapTargetGame = {
  id: string;
  startTime: Date;
  endTime: Date;
  timeIsSet: boolean;
};

export type OverlappingGameSlotDto = {
  id: string;
  name: string | null;
  startTime: string;
  endTime: string;
};

const busyStatuses = [...SLOT_BUSY_PARTICIPANT_STATUSES] as ParticipantStatus[];
const overlapGameStatuses = [...SLOT_OVERLAP_GAME_STATUSES] as GameStatus[];
const overlapEntityTypes = [...SLOT_OVERLAP_ENTITY_TYPES] as EntityType[];

function toSlotTarget(target: SlotOverlapTargetGame): SlotTarget {
  return {
    gameId: target.id,
    startTime: target.startTime,
    endTime: target.endTime,
    timeIsSet: target.timeIsSet,
  };
}

function occupancyFromBusyGame(
  game: {
    id: string;
    startTime: Date;
    endTime: Date;
    timeIsSet: boolean;
    status: string;
    entityType: string;
  },
  status: string,
): SlotOccupancy {
  return {
    gameId: game.id,
    status,
    startTime: game.startTime,
    endTime: game.endTime,
    timeIsSet: game.timeIsSet,
    gameStatus: game.status,
    entityType: game.entityType,
  };
}

function overlappingSlotGameWhere(target: SlotOverlapTargetGame): Prisma.GameWhereInput {
  return {
    id: { not: target.id },
    timeIsSet: true,
    status: { in: overlapGameStatuses },
    entityType: { in: overlapEntityTypes },
    startTime: { lt: target.endTime },
    endTime: { gt: target.startTime },
  };
}

export function overlappingPlayingParticipantWhere(
  target: SlotOverlapTargetGame,
): Prisma.GameParticipantWhereInput {
  return {
    status: { in: busyStatuses },
    game: overlappingSlotGameWhere(target),
  };
}

const busyGameSelect = {
  id: true,
  name: true,
  startTime: true,
  endTime: true,
  timeIsSet: true,
  status: true,
  entityType: true,
} as const;

export async function findOverlappingPlayingGames(
  userId: string,
  target: SlotOverlapTargetGame,
): Promise<OverlappingGameSlotDto[]> {
  if (!target.timeIsSet) return [];
  const slot = toSlotTarget(target);
  const games = await prisma.game.findMany({
    where: {
      ...overlappingSlotGameWhere(target),
      participants: {
        some: {
          userId,
          status: { in: busyStatuses },
        },
      },
    },
    select: busyGameSelect,
    orderBy: { startTime: 'asc' },
  });
  return games
    .filter((game) => occupancyBlocksSlot(occupancyFromBusyGame(game, 'PLAYING'), slot))
    .slice(0, 8)
    .map((game) => ({
      id: game.id,
      name: game.name,
      startTime: game.startTime.toISOString(),
      endTime: game.endTime.toISOString(),
    }));
}

export async function findUserIdsBusyInSlot(target: SlotOverlapTargetGame): Promise<string[]> {
  if (!target.timeIsSet) return [];
  const rows = await prisma.gameParticipant.findMany({
    where: overlappingPlayingParticipantWhere(target),
    select: {
      userId: true,
      status: true,
      game: { select: busyGameSelect },
    },
  });
  return userIdsBusyInSlot(
    rows.map((row) => ({
      userId: row.userId,
      ...occupancyFromBusyGame(row.game, row.status),
    })),
    toSlotTarget(target),
  );
}

export async function assertSlotOverlapConfirmed(options: {
  userId: string;
  targetGame: SlotOverlapTargetGame;
  confirmOverlap?: boolean;
}): Promise<void> {
  if (options.confirmOverlap) return;
  const overlappingGames = await findOverlappingPlayingGames(options.userId, options.targetGame);
  if (overlappingGames.length === 0) return;
  throw new ApiError(409, 'games.requiresOverlapConfirm', true, {
    requiresOverlapConfirm: true,
    overlappingGames,
  });
}
