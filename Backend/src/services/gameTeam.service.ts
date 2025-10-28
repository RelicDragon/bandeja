import prisma from '../config/database';
import { ApiError } from '../utils/ApiError';
import { ParticipantRole } from '@prisma/client';
import { GameService } from './game.service';

interface GameTeamData {
  teamNumber: number;
  name?: string;
  playerIds: string[];
}

export class GameTeamService {
  static async setGameTeams(gameId: string, teams: GameTeamData[], userId: string) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        participants: true,
        rounds: true,
      },
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    const participant = game.participants.find(
      (p) => p.userId === userId && (p.role === ParticipantRole.OWNER || p.role === ParticipantRole.ADMIN)
    );

    if (!participant) {
      throw new ApiError(403, 'Only game owners/admins can set fixed teams');
    }

    if (game.rounds.length > 0) {
      throw new ApiError(400, 'Cannot set fixed teams after game has started');
    }

    const allPlayerIds = teams.flatMap((t) => t.playerIds);
    const uniquePlayerIds = new Set(allPlayerIds);
    
    if (allPlayerIds.length !== uniquePlayerIds.size) {
      throw new ApiError(400, 'A player cannot be in multiple teams');
    }

    for (const playerId of uniquePlayerIds) {
      const isParticipant = game.participants.some((p) => p.userId === playerId);
      if (!isParticipant) {
        throw new ApiError(400, `Player ${playerId} is not a participant in this game`);
      }
    }

    return await prisma.$transaction(async (tx) => {
      await tx.gameTeam.deleteMany({
        where: { gameId },
      });

      for (const teamData of teams) {
        const team = await tx.gameTeam.create({
          data: {
            gameId,
            teamNumber: teamData.teamNumber,
            name: teamData.name,
          },
        });

        for (const playerId of teamData.playerIds) {
          await tx.gameTeamPlayer.create({
            data: {
              gameTeamId: team.id,
              userId: playerId,
            },
          });
        }
      }

      await tx.game.update({
        where: { id: gameId },
        data: { hasFixedTeams: true },
      });

      const game = await tx.game.findUnique({
        where: { id: gameId },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  level: true,
                  gender: true,
                },
              },
            },
          },
          club: true,
          court: true,
          fixedTeams: {
            include: {
              players: {
                include: {
                  user: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      avatar: true,
                      level: true,
                      gender: true,
                    },
                  },
                },
              },
            },
            orderBy: { teamNumber: 'asc' },
          },
        },
      });

      await GameService.updateGameReadiness(gameId);

      return game;
    });
  }

  static async getGameTeams(gameId: string) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true, hasFixedTeams: true },
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    if (!game.hasFixedTeams) {
      return [];
    }

    return await prisma.gameTeam.findMany({
      where: { gameId },
      include: {
        players: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                level: true,
              },
            },
          },
        },
      },
      orderBy: { teamNumber: 'asc' },
    });
  }

  static async deleteGameTeams(gameId: string, userId: string) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        participants: true,
        rounds: true,
      },
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    const participant = game.participants.find(
      (p) => p.userId === userId && (p.role === ParticipantRole.OWNER || p.role === ParticipantRole.ADMIN)
    );

    if (!participant) {
      throw new ApiError(403, 'Only game owners/admins can delete fixed teams');
    }

    if (game.rounds.length > 0) {
      throw new ApiError(400, 'Cannot delete fixed teams after game has started');
    }

    await prisma.$transaction(async (tx) => {
      await tx.gameTeam.deleteMany({
        where: { gameId },
      });

      await tx.game.update({
        where: { id: gameId },
        data: { hasFixedTeams: false },
      });
    });

    // Update readiness status after teams are deleted
    await GameService.updateGameReadiness(gameId);
  }
}

