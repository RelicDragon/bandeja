import prisma from '../config/database';
import { ApiError } from './ApiError';
import { GameStatus, GenderTeam, EntityType, Gender } from '@prisma/client';

export interface GameWithPlayingParticipants {
  id: string;
  status: GameStatus;
  genderTeams: GenderTeam;
  maxParticipants: number;
  entityType: EntityType;
  allowDirectJoin: boolean;
  anyoneCanInvite: boolean;
  minLevel?: number | null;
  maxLevel?: number | null;
  participants: Array<{
    userId: string;
    status: string;
    user?: {
      gender: Gender;
    };
  }>;
}

export async function fetchGameWithPlayingParticipants(
  tx: any,
  gameId: string
): Promise<GameWithPlayingParticipants> {
  const game = await tx.game.findUnique({
    where: { id: gameId },
    include: {
      participants: {
        where: { status: 'PLAYING' },
        include: {
          user: {
            select: { gender: true },
          },
        },
      },
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  return game;
}

export async function fetchGameWithDetails(gameId: string) {
  return await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      court: {
        include: { club: true },
      },
      club: true,
    },
  });
}
