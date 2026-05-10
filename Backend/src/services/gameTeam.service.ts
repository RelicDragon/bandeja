import prisma from '../config/database';
import { Prisma } from '@prisma/client';
import { ApiError } from '../utils/ApiError';
import { GameService } from './game/game.service';
import { USER_SELECT_FIELDS } from '../utils/constants';
import { LeagueSyncService } from './league/sync.service';
import { EntityType } from '@prisma/client';

interface GameTeamData {
  teamNumber: number;
  name?: string;
  playerIds: string[];
}

async function syncLeagueSeasonAfterFixedTeamsChange(gameId: string) {
  const row = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      entityType: true,
      leagueRound: { select: { leagueSeasonId: true } },
    },
  });
  if (!row) return;
  if (row.entityType === EntityType.LEAGUE_SEASON) {
    await LeagueSyncService.syncLeagueParticipants(gameId);
    return;
  }
  const leagueSeasonId = row.leagueRound?.leagueSeasonId;
  if (leagueSeasonId) {
    await LeagueSyncService.syncLeagueParticipants(leagueSeasonId);
  }
}

export class GameTeamService {
  static async setGameTeams(gameId: string, teams: GameTeamData[]) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT id FROM "Game" WHERE id = ${gameId} FOR UPDATE`);

      const game = await tx.game.findUnique({
        where: { id: gameId },
        include: {
          participants: true,
          rounds: true,
        },
      });

      if (!game) {
        throw new ApiError(404, 'Game not found');
      }

      if (game.rounds.length > 0) {
        throw new ApiError(400, 'Cannot set fixed pairs after game has started');
      }

      const slotCount = Math.floor(game.maxParticipants / 2);
      if (slotCount < 1) {
        throw new ApiError(400, 'Game must allow at least one fixed pair');
      }

      const byNumber = new Map<number, string[]>();
      const nameByNumber = new Map<number, string | undefined>();
      for (const t of teams) {
        const n = t.teamNumber;
        if (typeof n !== 'number' || !Number.isFinite(n) || n < 1 || n > slotCount) {
          continue;
        }
        const ids = Array.isArray(t.playerIds) ? t.playerIds.filter((id) => typeof id === 'string' && id.length > 0) : [];
        byNumber.set(n, ids);
        if (t.name !== undefined) {
          nameByNumber.set(n, t.name);
        }
      }

      const allPlayerIds = [...byNumber.values()].flat();
      const uniquePlayerIds = new Set(allPlayerIds);

      for (let teamNumber = 1; teamNumber <= slotCount; teamNumber++) {
        const ids = byNumber.get(teamNumber) ?? [];
        if (ids.length !== new Set(ids).size) {
          throw new ApiError(400, 'A player cannot appear twice on the same team');
        }
      }

      if (!game.allowUserInMultipleTeams && allPlayerIds.length !== uniquePlayerIds.size) {
        throw new ApiError(400, 'A player cannot be in multiple teams');
      }

      if (game.allowUserInMultipleTeams) {
        const rosterKeys: string[] = [];
        for (let teamNumber = 1; teamNumber <= slotCount; teamNumber++) {
          const ids = [...(byNumber.get(teamNumber) ?? [])].sort();
          if (ids.length === 0) {
            continue;
          }
          rosterKeys.push(ids.join(':'));
        }
        if (rosterKeys.length !== new Set(rosterKeys).size) {
          throw new ApiError(400, 'Two fixed teams cannot have identical rosters');
        }
      }

      for (const playerId of uniquePlayerIds) {
        const isParticipant = game.participants.some((p) => p.userId === playerId);
        if (!isParticipant) {
          throw new ApiError(400, `Player ${playerId} is not a participant in this game`);
        }
      }

      await tx.gameTeam.deleteMany({
        where: { gameId },
      });

      for (let teamNumber = 1; teamNumber <= slotCount; teamNumber++) {
        const playerIds = byNumber.get(teamNumber) ?? [];
        await tx.gameTeam.create({
          data: {
            gameId,
            teamNumber,
            name: nameByNumber.get(teamNumber),
            players: {
              create: playerIds.map((userId) => ({ userId })),
            },
          },
        });
      }

      await tx.game.update({
        where: { id: gameId },
        data: { hasFixedTeams: true },
      });
    });

    await GameService.updateGameReadiness(gameId);
    await syncLeagueSeasonAfterFixedTeamsChange(gameId);

    const updatedGame = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        participants: {
          include: {
            user: {
                select: USER_SELECT_FIELDS,
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

    return updatedGame;
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

  static async deleteGameTeams(gameId: string) {
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

    if (game.rounds.length > 0) {
      throw new ApiError(400, 'Cannot delete fixed pairs after game has started');
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

    await GameService.updateGameReadiness(gameId);
    await syncLeagueSeasonAfterFixedTeamsChange(gameId);
  }
}

