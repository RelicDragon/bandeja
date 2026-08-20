import { EntityType, GameStatus, ParticipantStatus, Prisma } from '@prisma/client';
import {
  SLOT_BUSY_PARTICIPANT_STATUSES,
  SLOT_OVERLAP_ENTITY_TYPES,
  SLOT_OVERLAP_GAME_STATUSES,
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

export async function findOverlappingPlayingGames(
  userId: string,
  target: SlotOverlapTargetGame,
): Promise<OverlappingGameSlotDto[]> {
  if (!target.timeIsSet) return [];
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
    select: { id: true, name: true, startTime: true, endTime: true },
    orderBy: { startTime: 'asc' },
    take: 8,
  });
  return games.map((game) => ({
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
    select: { userId: true },
    distinct: ['userId'],
  });
  return rows.map((row) => row.userId);
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
